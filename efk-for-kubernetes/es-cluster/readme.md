

## Kubernetes Helm3 部署 ElasticSearch集群 & Kibana 7  & Filebeat 收集展示日志



## 一、前言： 

- Elasticsearch 是一个分布式的搜索和分析引擎，可以用于全文检索、结构化检索和分析，并能将这三者结合起来。

   

- Kibana 是一个为 Elasticsearch 平台分析和可视化的开源平台，使用 Kibana 能够搜索、展示存储在 Elasticsearch 中的索引数据。使用它可以很方便用图表、表格、地图展示和分析数据。

  

- Helm： Helm是一个Kubernetes的包管理工具，就像Linux下的包管理器，如yum/apt等，可以很方便的将之前打包好的yaml文件部署到kubernetes上。本文采用的是helm 3.0 版本（相比v2版本最大变化是将Tiller组件删除，并大部分代码重构）



## 二、资源信息



| 主机名 | IP地址         | 节点信息                            |
| ------ | -------------- | ----------------------------------- |
| Master | 192.168.31.61  | master 节点 8核8G（也用于工作节点） |
| Node-1 | 192.168.31.62  | node 节点 8核15G                    |
| Node-2 | 192.168.31.63  | node 节点 8核15G                    |
| NFS    | 192.168.31.100 | nfs 存储节点 8核8G                  |



|   集群名称    |     节点类型      | 副本数目 | 存储大小 |     网络模式      | 描述                                     |
| :-----------: | :---------------: | :------: | :------: | :---------------: | :--------------------------------------- |
| elasticsearch | Kubernetes Master |    2     |   5Gi    |     ClusterIP     | 主节节点，用于控制 ES 集群               |
| elasticsearch |  Kubernetes Data  |    3     |   50Gi   |     ClusterIP     | 数据节点，用于存储 ES 数据               |
| elasticsearch | Kubernetes Client |    2     |    无    | NodePort（30200） | 负责处理用户请求，实现请求转发、负载均衡 |

| 软件名                 | 版本    | 备注   |
| ---------------------- | ------- | ------ |
| kubernetes             | v1.18.6 |        |
| Elasticsearch          | 7.7.1   | 集群   |
| Filebeat               | 7.7.1   |        |
| Kibana                 | 7.7.1   |        |
| Nfs-client-provisioner | v1.2.8  | 动态PV |



## 三、软件部署



### 3.1部署NFS 服务

```bash
#   创建 NFS 存储目录
mkdir -p /home/elk
#   安装nfs服务
yum -y install nfs-utils rpcbind
#   修改配置文件
echo "/home/elk *(rw,sync,no_root_squash,no_subtree_check)" >> /etc/exports
#   启动服务
systemctl start nfs && systemctl start rpcbind
#   设置开机启动
systemctl enable nfs-server && systemctl enable rpcbind
```

#### 3.1.1集群所有节点都要安装nfs-utils

```
yum -y install nfs-utils

#记住，所有节点都要安装nfs-utils，否则无法使用pv
```

#### 3.1.2部署动态PV

创建NFS  动态PV专属命名空间

```
[root@master-1 ~]# kubectl create ns nfs
namespace/nfs created
```

#####    

#### 3.1.3使用Helm 部署nfs-client-provisioner

```
注意事项：
		（1）、nfs-client-provisioner部署到刚刚创建的nfs命名空间下
		（2）、storageClass.name #指定storageClassName名称，用于 PVC 自动绑定专属动态 PV 上
		（3）、需要指定NFS服务器的IP 地址(192.168.31.100)，以及共享名称路径(/home/elk)
```

```bash
#添加helm charts repo
[root@master-1 es-single-node]# helm repo add helm-stable https://charts.helm.sh/stable        
[root@master-1 es-single-node]# helm repo update

cat >  elastic-client-nfs.yaml << EOF
# NFS 设置
nfs:
  server: 192.168.31.100
  path: /home/elk
storageClass:
  # 此配置用于绑定 PVC 和 PV
  name: elastic-nfs-client
  
  # 资源回收策略
#主要用于绑定的PVC删除后，资源释放后如何处理该PVC在存储设备上写入的数据。 
#Retain：保留，删除PVC后，PV保留数据；
#Recycle：回收空间，删除PVC后，简单的清除文件；（NFS和HostPath存储支持）
#Delete：删除，删除PVC后，与PV相连接的后端存储会删除数据；（AWS EBS、Azure Disk、Cinder volumes、GCE PD支持）
  reclaimPolicy: Retain
# 使用镜像
image:
  repository: kubesphere/nfs-client-provisioner
# 副本数量
replicaCount: 1
EOF

#helm 部署 nfs-client-provisioner
[root@master-1 es-single-node]# helm install elastic-nfs-storage -n nfs --values elastic-client-nfs.yaml helm-stable/nfs-client-provisioner --version 1.2.8
```

#### 3.1.4查看 nfs-client-provisioner Pod 运行状态

```
[root@master-1 es-single-node]# kubectl get pods -n nfs
NAME                                                          READY   STATUS    RESTARTS   AGE
elastic-nfs-storage-nfs-client-provisioner-78c7754777-8kvlg   1/1     Running   0          28m
```



### 3.2 部署ElasticSearch 集群

#### 3.2.1 准备好镜像

```
# 拉取 elasticsearch 镜像
docker pull elasticsearch:7.7.1

# 拉取 kibana 镜像
docker pull kibana:7.7.1

# 拉取 filebeat 镜像
docker pull  elastic/filebeat:7.7.1
```



#### 3.2.2 创建集群证书

ElasticSearch 7.x 版本默认安装了 `X-Pack` 插件，并且部分功能免费，这里我们配置安全证书文件。

生成证书的方法很多，这里我直接运行容器生成证书

```
# 运行容器生成证书
docker run --name elastic-charts-certs -i -w /app elasticsearch:7.7.1 /bin/sh -c  \
  "elasticsearch-certutil ca --out /app/elastic-stack-ca.p12 --pass '' && \
    elasticsearch-certutil cert --name security-master --dns \
    security-master --ca /app/elastic-stack-ca.p12 --pass '' --ca-pass '' --out /app/elastic-certificates.p12"
    
# 从容器中将生成的证书拷贝出来
docker cp elastic-charts-certs:/app/elastic-certificates.p12 ./ 

# 删除容器
docker rm -f elastic-charts-certs

# 将 pcks12 中的信息分离出来，写入文件
openssl pkcs12 -nodes -passin pass:'' -in elastic-certificates.p12 -out elastic-certificate.pem
```



#### 3.2.3 添加证书到集群

😁也可以直接使用我创建好的证书，在 https://github.com/fxkjnj/kubernetes/tree/main/efk-for-kubernetes/es-cluster/certificate 目录下

```
#创建ES 集群 专属命名空间
kubectl create ns efk


# 添加证书
kubectl create secret generic elastic-certificates --from-file=elastic-certificates.p12  -n efk

kubectl create secret generic elastic-certificate-pem --from-file=elastic-certificate.pem  -n efk

# 设置集群用户名密码，用户名不建议修改
kubectl create secret generic elastic-credentials \
  --from-literal=username=elastic --from-literal=password=elastic123456  -n efk
```



#### 3.2.4 准备ElasticSearch 配置参数的 values.yaml 文件

   通过 Helm 安装  需要事先创建一个带有配置参数的 values.yaml 文件。然后再执行 Helm install 安装命令时，指定使用此文件。

👉 ElasticSearch 相关的Yaml 文件，在https://github.com/fxkjnj/kubernetes/tree/main/efk-for-kubernetes/es-cluster/es-cluster-yaml目录下



ElasticSearch Master，主节节点，用于控制 ES 集群

```
cat >  es-master-values.yaml << EOF
# ============设置集群名称============
## 设置集群名称
clusterName: "elasticsearch"
## 设置节点名称
nodeGroup: "master"
## 设置角色
roles:
  master: "true"
  ingest: "false"
  data: "false"

# ============镜像配置============
## 指定镜像与镜像版本
image: "docker.elastic.co/elasticsearch/elasticsearch"
imageTag: "7.7.1"
## 副本数
replicas: 2

# ============资源配置============
## JVM 配置参数
esJavaOpts: "-Xmx1g -Xms1g"
## 部署资源配置(生成环境一定要设置大些)
resources:
  requests:
    cpu: "2000m"
    memory: "2Gi"
  limits:
    cpu: "2000m"
    memory: "2Gi"
## 数据持久卷配置
persistence:
  enabled: true
## 存储数据大小配置
volumeClaimTemplate:
  storageClassName: elastic-nfs-client
  accessModes: [ "ReadWriteOnce" ]
  resources:
    requests:
      storage: 5Gi

# ============安全配置============
## 设置协议，可配置为 http、https
protocol: http
## 证书挂载配置，这里我们挂入上面创建的证书
secretMounts:
  - name: elastic-certificates
    secretName: elastic-certificates
    path: /usr/share/elasticsearch/config/certs
## 允许您在/usr/share/elasticsearch/config/中添加任何自定义配置文件,例如 elasticsearch.yml
## ElasticSearch 7.x 默认安装了 x-pack 插件，部分功能免费，这里我们配置下
## 下面注掉的部分为配置 https 证书，配置此部分还需要配置 helm 参数 protocol 值改为 https
esConfig:
  elasticsearch.yml: |
    xpack.security.enabled: true
    xpack.security.transport.ssl.enabled: true
    xpack.security.transport.ssl.verification_mode: certificate
    xpack.security.transport.ssl.keystore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
    xpack.security.transport.ssl.truststore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
    xpack.monitoring.exporters.my_local.type: local
    xpack.monitoring.exporters.my_local.use_ingest: false
    # xpack.security.http.ssl.enabled: true
    # xpack.security.http.ssl.truststore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
    # xpack.security.http.ssl.keystore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
## 环境变量配置，这里引入上面设置的用户名、密码 secret 文件
extraEnvs:
  - name: ELASTIC_USERNAME
    valueFrom:
      secretKeyRef:
        name: elastic-credentials
        key: username
  - name: ELASTIC_PASSWORD
    valueFrom:
      secretKeyRef:
        name: elastic-credentials
        key: password

# ============调度配置============
## 设置调度策略
## - hard：只有当有足够的节点时 Pod 才会被调度，并且它们永远不会出现在同一个节点上
## - soft：尽最大努力调度
antiAffinity: "hard"
## 容忍配置（一般 kubernetes master 或其它设置污点的节点，只有指定容忍才能进行调度，如果测试环境只有三个节点，则可以开启在 master 节点安装应用）
#tolerations: 
#  - operator: "Exists"  ##容忍全部污点
EOF
```



ElasticSearch Data，数据节点，用于存储 ES 数据

```
cat >  es-data-values.yaml  << EOF
# ============设置集群名称============
## 设置集群名称
clusterName: "elasticsearch"
## 设置节点名称
nodeGroup: "data"
## 设置角色
roles:
  master: "false"
  ingest: "true"
  data: "true"

# ============镜像配置============
## 指定镜像与镜像版本
image: "docker.elastic.co/elasticsearch/elasticsearch"
imageTag: "7.7.1"
## 副本数
replicas: 2

# ============资源配置============
## JVM 配置参数
esJavaOpts: "-Xmx3g -Xms3g"
## 部署资源配置(生成环境一定要设置大些)
resources:
  requests:
    cpu: "1000m"
    memory: "2Gi"
  limits:
    cpu: "1000m"
    memory: "2Gi"
## 数据持久卷配置
persistence:
  enabled: true
## 存储数据大小配置
volumeClaimTemplate:
  storageClassName: elastic-nfs-client
  accessModes: [ "ReadWriteOnce" ]
  resources:
    requests:
      storage: 50Gi

# ============安全配置============
## 设置协议，可配置为 http、https
protocol: http
## 证书挂载配置，这里我们挂入上面创建的证书
secretMounts:
  - name: elastic-certificates
    secretName: elastic-certificates
    path: /usr/share/elasticsearch/config/certs
## 允许您在/usr/share/elasticsearch/config/中添加任何自定义配置文件,例如 elasticsearch.yml
## ElasticSearch 7.x 默认安装了 x-pack 插件，部分功能免费，这里我们配置下
## 下面注掉的部分为配置 https 证书，配置此部分还需要配置 helm 参数 protocol 值改为 https
esConfig:
  elasticsearch.yml: |
    xpack.security.enabled: true
    xpack.security.transport.ssl.enabled: true
    xpack.security.transport.ssl.verification_mode: certificate
    xpack.security.transport.ssl.keystore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
    xpack.security.transport.ssl.truststore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
    xpack.monitoring.exporters.my_local.type: local
    xpack.monitoring.exporters.my_local.use_ingest: false
    # xpack.security.http.ssl.enabled: true
    # xpack.security.http.ssl.truststore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
    # xpack.security.http.ssl.keystore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
## 环境变量配置，这里引入上面设置的用户名、密码 secret 文件
extraEnvs:
  - name: ELASTIC_USERNAME
    valueFrom:
      secretKeyRef:
        name: elastic-credentials
        key: username
  - name: ELASTIC_PASSWORD
    valueFrom:
      secretKeyRef:
        name: elastic-credentials
        key: password

# ============调度配置============
## 设置调度策略
## - hard：只有当有足够的节点时 Pod 才会被调度，并且它们永远不会出现在同一个节点上
## - soft：尽最大努力调度
antiAffinity: "hard"
## 容忍配置（一般 kubernetes master 或其它设置污点的节点，只有指定容忍才能进行调度，如果测试环境只有三个节点，则可以开启在 master 节点安装应用）
#tolerations: 
#  - operator: "Exists"  ##容忍全部污点
EOF
```

ElasticSearch Client，负责处理用户请求，实现请求转发、负载均衡

```
cat >  es-client-values.yaml     << EOF
# ============设置集群名称============
## 设置集群名称
clusterName: "elasticsearch"
## 设置节点名称
nodeGroup: "client"
## 设置角色
roles:
  master: "false"
  ingest: "false"
  data: "false"

# ============镜像配置============
## 指定镜像与镜像版本
image: "docker.elastic.co/elasticsearch/elasticsearch"
imageTag: "7.7.1"
## 副本数
replicas: 2

# ============资源配置============
## JVM 配置参数
esJavaOpts: "-Xmx3g -Xms3g"
## 部署资源配置(生成环境一定要设置大些)
resources:
  requests:
    cpu: "1000m"
    memory: "2Gi"
  limits:
    cpu: "1000m"
    memory: "2Gi"
## 数据持久卷配置
persistence:
  enabled: false

# ============安全配置============
## 设置协议，可配置为 http、https
protocol: http
## 证书挂载配置，这里我们挂入上面创建的证书
secretMounts:
  - name: elastic-certificates
    secretName: elastic-certificates
    path: /usr/share/elasticsearch/config/certs
## 允许您在/usr/share/elasticsearch/config/中添加任何自定义配置文件,例如 elasticsearch.yml
## ElasticSearch 7.x 默认安装了 x-pack 插件，部分功能免费，这里我们配置下
## 下面注掉的部分为配置 https 证书，配置此部分还需要配置 helm 参数 protocol 值改为 https
esConfig:
  elasticsearch.yml: |
    xpack.security.enabled: true
    xpack.security.transport.ssl.enabled: true
    xpack.security.transport.ssl.verification_mode: certificate
    xpack.security.transport.ssl.keystore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
    xpack.security.transport.ssl.truststore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
    xpack.monitoring.exporters.my_local.type: local
    xpack.monitoring.exporters.my_local.use_ingest: false
    # xpack.security.http.ssl.enabled: true
    # xpack.security.http.ssl.truststore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
    # xpack.security.http.ssl.keystore.path: /usr/share/elasticsearch/config/certs/elastic-certificates.p12
## 环境变量配置，这里引入上面设置的用户名、密码 secret 文件
extraEnvs:
  - name: ELASTIC_USERNAME
    valueFrom:
      secretKeyRef:
        name: elastic-credentials
        key: username
  - name: ELASTIC_PASSWORD
    valueFrom:
      secretKeyRef:
        name: elastic-credentials
        key: password

# ============Service 配置============
service:
  type: NodePort
  nodePort: "30200"
EOF
```



#### 3.2.5 使用Helm 部署ElasticSearch 集群



ElasticSearch 与 Kibana 的 Helm Chart 模板是 ES 官方 Github 获取的，它的 Github 地址为 https://github.com/elastic/helm-charts 



ElaticSearch  集群 安装需要安装三次，分别安装 ElasticSearch Master、ElasticSearch Data、ElasticSearch Client 三组。

- 安装的第一组 ElasticSearch 作为 Master 角色节点，负责集群间的管理工作；
- 安装的第二组 ElasticSearch 作为 Data 节点，负责存储数据；
- 安装的第三组 ElasticSearch 作为 Client 节点，负责代理 ElasticSearch Cluster 集群，负载均衡。



ElasticSearch 安装部署如下：

- `-f`：指定变量配置文件

- `–version`：指定使用的 Helm Chart 版本号

- 按照顺序来部署，Master——>Data——>Client

-  -n 指定命名空间

  

```
# 添加 Chart 仓库
helm repo add  elastic    https://helm.elastic.co
helm repo update


# 安装 ElasticSearch Master 节点 （2个节点）
helm install elasticsearch-master -f es-master-values.yaml --version 7.7.1 elastic/elasticsearch -n efk

# 安装 ElasticSearch Data 节点（2个节点）
helm install elasticsearch-data -f es-data-values.yaml --version 7.7.1 elastic/elasticsearch  -n efk

# 安装 ElasticSearch Client 节点（2个节点）
helm install elasticsearch-client -f es-client-values.yaml --version 7.7.1 elastic/elasticsearch  -n efk
```



⚠️注意:

​     在安装 Master 节点后 Pod 启动时候会抛出异常，就绪探针探活失败，这是个正常现象。在执行安装 Data 节点后 Master 节点 Pod 就会恢复正常。



#### 3.2.6 查看ElasticSearch 集群 pod 运行状况

```
[root@master-1 es-yaml]# kubectl get pods -n efk
NAME                     READY   STATUS    RESTARTS   AGE
elasticsearch-client-0   1/1     Running   0          6m4s
elasticsearch-client-1   1/1     Running   0          6m4s
elasticsearch-data-0     1/1     Running   0          9m14s
elasticsearch-data-1     1/1     Running   0          9m14s
elasticsearch-master-0   1/1     Running   1          17h
elasticsearch-master-1   1/1     Running   0          21m

[root@master-1 es-yaml]# kubectl get svc -n efk
NAME                            TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)                         AGE
elasticsearch-client            NodePort    10.0.0.147   <none>        9200:30200/TCP,9300:32468/TCP   6m18s
elasticsearch-client-headless   ClusterIP   None         <none>        9200/TCP,9300/TCP               6m18s
elasticsearch-data              ClusterIP   10.0.0.242   <none>        9200/TCP,9300/TCP               9m28s
elasticsearch-data-headless     ClusterIP   None         <none>        9200/TCP,9300/TCP               9m28s
elasticsearch-master            ClusterIP   10.0.0.211   <none>        9200/TCP,9300/TCP               17h
elasticsearch-master-headless   ClusterIP   None         <none>        9200/TCP,9300/TCP               17h


```



### 3.3 使用Helm 部署Kibana



#### 3.3.1 准备Kibana 配置参数的 values.yaml 文件   

​    通过 Helm 安装  需要事先创建一个带有配置参数的 values.yaml 文件。然后再执行 Helm install 安装命令时，指定使用此文件。

👉 Kibana 相关的Yaml 文件，在https://github.com/fxkjnj/kubernetes/tree/main/efk-for-kubernetes/es-cluster/ 目录下

```
cat >  es-kibana-values.yaml    << EOF
# ============镜像配置============
## 指定镜像与镜像版本
image: "docker.elastic.co/kibana/kibana"
imageTag: "7.7.1"

## 配置 ElasticSearch 地址，连接的是ElasticSearch Client节点
elasticsearchHosts: "http://elasticsearch-client:9200"


# ============环境变量配置============
## 环境变量配置，这里引入上面设置的用户名、密码 secret 文件
extraEnvs:
  - name: 'ELASTICSEARCH_USERNAME'
    valueFrom:
      secretKeyRef:
        name: elastic-credentials
        key: username
  - name: 'ELASTICSEARCH_PASSWORD'
    valueFrom:
      secretKeyRef:
        name: elastic-credentials
        key: password

# ============资源配置============
resources:
  requests:
    cpu: "1000m"
    memory: "1Gi"
  limits:
    cpu: "1000m"
    memory: "2Gi"

# ============配置 Kibana 参数============ 
## kibana 配置中添加语言配置，设置 kibana 为中文
kibanaConfig:
  kibana.yml: |
    i18n.locale: "zh-CN"

# ============Service 配置============
service:
  type: NodePort
  nodePort: "30601"
EOF
```

使用helm 部署kibana

- `-f`：指定变量配置文件
- `–version`：指定使用的 Helm Chart 版本号

```
helm install kibana -f es-kibana-values.yaml --version 7.7.1 elastic/kibana -n efk
```



#### 3.3.2 查看Kibana pod 运行状况

```
[root@master-1 es-cluster]# kubectl get pods -n efk
NAME                             READY   STATUS    RESTARTS   AGE
kibana-kibana-67c546fb7b-wj98j   1/1     Running   0          34m


[root@master-1 es-cluster]# kubectl get svc -n efk
NAME                            TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)                    AGE
kibana-kibana                   NodePort    10.0.0.196   <none>        5601:30601/TCP                  35m

```

#### 3.3.3 登陆kibana 控制台查看

输入账户，密码 :  elastic/elastic123456

![](http://jpg.fxkjnj.com/soft/kubernetes/elastic-1.png)



![](http://jpg.fxkjnj.com/soft/kubernetes/elastic-2.png)





## 四、收集日志并展示

### 4.1 使用Helm 部署filebeat 收集容器标准输出日志



![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-8-1.png)

大致思路：

       以DaemonSet方式在每个Node上部署一个Filebeat 的日志收集程序的Pod，采用hostPath 方式把 /var/lib/docker/containers 挂载到Filebeat 容器中，/var/lib/docker/containers 目录下的就是每个容器标准输出的日志



#### 4.1.1 准备filebeat 配置参数的 values.yaml 文件  

```
cat >   es-filebeat.yaml << EOF
# 使用镜像
image: "elastic/filebeat"
# 添加配置
filebeatConfig:
  filebeat.yml: |
    filebeat.inputs:
    - type: docker
      containers.ids:
      - '*'
      processors:
      - add_kubernetes_metadata:
          in_cluster: true
    output.elasticsearch:
      # elasticsearch 用户
      username: 'elastic'
      # elasticsearch 密码
      password: 'elastic123456'
      # elasticsearch 主机
      hosts: ["elasticsearch-client:9200"]
# 环境变量
extraEnvs:
  - name: 'ELASTICSEARCH_USERNAME'
    valueFrom:
      secretKeyRef:
        name: elastic-credentials
        key: username
  - name: 'ELASTICSEARCH_PASSWORD'
    valueFrom:
      secretKeyRef:
        name: elastic-credentials
        key: password
EOF
```

使用helm 部署filebeat

- `-f`：指定变量配置文件
- `–version`：指定使用的 Helm Chart 版本号
- -n 指定命名空间

```
helm install filebeat -f es-filebeat.yaml --version 7.7.1 elastic/filebeat -n efk
```



#### 4.1.2查看filebeat pod 运行状况

 ```
[root@master-1 es-cluster]# kubectl get pods -n efk
NAME                             READY   STATUS    RESTARTS   AGE
filebeat-filebeat-2j79j          1/1     Running   0          88m
filebeat-filebeat-v8fmw          1/1     Running   0          88m
 ```

PS： 这里发现 filebeat 就部署了在两个Node节点上，我集群中共有3个节点。这是因为还有一个节点我打了污点，不允许POD调度到该节点上



#### 4.1.3  登陆kibana  管理索引， 添加索引模式

索引管理：

（一般只要有数据入到ES中就会有索引出现 ，如果没有出现可以试着访问下业务使其产生日志输出到ES中）

点击👈左边的 Stack Management 中的 索引管理 可以看到一个名词为filebeat-7.9.2-2021.03.1-000001的索引，状态为open

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-5-1.png)



添加索引模式:

点击👈左边的 Stack Management 中的索引模式，创建索引模式

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-6-1.png)

输入索引模式名称： filebeat-7.9.2-*  

表示可以匹配到上面的索引 filebeat-7.9.2-2021.03.01-000001

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-6-2.png)



选择@timestamp 时间字段

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-10.png)

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-11-1.png)



#### 4.1.4 启动一个nginx 的Pod，验证日志数据

```
cat >  app-log-stdout.yaml  << EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-log-stdout
spec:
  replicas: 3
  selector:
    matchLabels:
      project: stdout-test
      app: nginx-stdout
  template:
    metadata:
      labels:
        project: stdout-test
        app: nginx-stdout
    spec:
      containers:
      - name: nginx 
        image: nginx
---
apiVersion: v1
kind: Service
metadata:
  name: app-log-stdout
spec:
  ports:
  - port: 80
    protocol: TCP
    targetPort: 80
  selector:
    project: stdout-test
    app: nginx-stdout
EOF


[root@master-1 es-single-node]# kubectl apply -f app-log-stdout.yaml 
deployment.apps/app-log-stdout created
service/app-log-stdout created
```



#### 4.1.5 查看nginx pod,service 状态

```
[root@master-1 es-single-node]# kubectl get pods -l app=nginx-stdout
NAME                              READY   STATUS    RESTARTS   AGE
app-log-stdout-76fb86fcf6-cjch4   1/1     Running   0          2m34s
app-log-stdout-76fb86fcf6-wcfqm   1/1     Running   0          2m34s
app-log-stdout-76fb86fcf6-zgzcc   1/1     Running   0          2m34s

[root@master-1 es-single-node]# kubectl get service
NAME             TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)   AGE
app-log-stdout   ClusterIP   10.0.0.167   <none>        80/TCP    2m41s
kubernetes       ClusterIP   10.0.0.1     <none>        443/TCP   63d
```



#### 4.1.6  访问nginx 的Pod 使其产生日志

```
[root@node-1 ~]# curl 10.0.0.167

<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>
    body {
        width: 35em;
        margin: 0 auto;
        font-family: Tahoma, Verdana, Arial, sans-serif;
    }
</style>
</head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and
working. Further configuration is required.</p>

<p>For online documentation and support please refer to
<a href="http://nginx.org/">nginx.org</a>.<br/>
Commercial support is available at
<a href="http://nginx.com/">nginx.com</a>.</p>

<p><em>Thank you for using nginx.</em></p>
</body>
</html>
```



#### 4.1.7  登陆kibana dashboard 检索nginx 日志

检索的语句： kubernetes.namespace : "default" and message : "curl"

可以看到有1个 日志被命中了 

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-13.png)











### 4.2 使用 filebeat 收集容器中日志文件

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-8-2.png)

大致思路：

     在Pod中增加一个容器运行日志采集器，使用emtyDir共享日志目录让日志采集器读取到业务容器的日志文件



PS:  收集容器中日志文件所需要的Pod Yaml 文件 在 https://github.com/fxkjnj/kubernetes/tree/main/efk-for-kubernetes/es-cluster/app-tomcat-filebeat-log目录下 



#### 4.2.1 编写dockerfile，创建 一个标准的tomcat8 镜像

PS: 确保本机有docker 的环境, 如果没有部署docker 可以参考我的另一篇文章

https://www.fxkjnj.com/?p=2732

😁当然如果不想自己制作镜像，也可以使用我制作好的tomcat8 镜像 docker pull feixiangkeji974907/tomcat-test:v8 



创建软件目录，下载tomcat8,  jdk1.8 

[root@master-1 es-single-node]# mkdir  app-tomcat-filebeat-log

```
[root@master-1 es-single-node]# cd app-tomcat-filebeat-log
[root@master-1 app-tomcat-filebeat-log]# wget http://jpg.fxkjnj.com/ruanjian/apache-tomcat-8.5.39.tar.gz
[root@master-1 app-tomcat-filebeat-log]# wget http://jpg.fxkjnj.com/ruanjian/jdk1.8.0_66.tar.gz

```



编写dockerfile

```
cat >  Dockerfile  << EOF
FROM centos
MAINTAINER fxkjnj.com fxkj
EXPOSE 8080
WORKDIR /opt

#ADD jdk1.8
    COPY jdk1.8.0_66.tar.gz /opt
    RUN tar zxf /opt/jdk1.8.0_66.tar.gz -C /usr/local/ && rm -rf /opt/jdk1.8.0_66.tar.gz
    RUN ln -s /usr/local/jdk1.8.0_66 /usr/local/jdk
#环境变量/etc/profile
    ENV JAVA_HOME /usr/local/jdk
    ENV CLASSPATH=.:$JAVA_HOME/jre/lib/rt.jar:$JAVA_HOME/lib/dt.jar:$JAVA_HOME/lib/tools.jar
    ENV PATH $PATH:$JAVA_HOME/bin

#ADD tomcat8
    COPY apache-tomcat-8.5.39.tar.gz /opt
    RUN tar zxf apache-tomcat-8.5.39.tar.gz -C /usr/local  && rm -rf apache-tomcat-8.5.39.tar.gz
    RUN mv /usr/local/apache-tomcat-8.5.39 /usr/local/tomcat

#CMD
ENTRYPOINT /usr/local/tomcat/bin/startup.sh && tail -f /usr/local/tomcat/logs/catalina.out
EOF
```

构建镜像

```
[root@master-1 app-tomcat-filebeat-log]# docker build -t feixiangkeji974907/tomcat-test:v8 /root/kubernetes/elk-for-kubernetes/es-single-node/app-tomcat-filebeat-log/
Sending build context to Docker daemon  191.2MB
Step 1/14 : FROM centos
latest: Pulling from library/centos
7a0437f04f83: Pull complete 
Digest: sha256:5528e8b1b1719d34604c87e11dcd1c0a20bedf46e83b5632cdeac91b8c04efc1
Status: Downloaded newer image for centos:latest
 ---> 300e315adb2f
Step 2/14 : MAINTAINER fxkjnj.com fxkj
 ---> Running in c6960bcfe61f
Removing intermediate container c6960bcfe61f
 ---> 4d90c5f058e4
Step 3/14 : EXPOSE 8080
 ---> Running in 4b74564852a6
Removing intermediate container 4b74564852a6
 ---> 1d513bed4b8a
Step 4/14 : WORKDIR /opt
 ---> Running in ba66ad1e1f2b
Removing intermediate container ba66ad1e1f2b
 ---> af3d2848cd2a
Step 5/14 : COPY jdk1.8.0_66.tar.gz /opt
 ---> 5407bdfd840e
Step 6/14 : RUN tar zxf /opt/jdk1.8.0_66.tar.gz -C /usr/local/ && rm -rf /opt/jdk1.8.0_66.tar.gz
 ---> Running in 969ef89b2a29
Removing intermediate container 969ef89b2a29
 ---> 84717736fc66
Step 7/14 : RUN ln -s /usr/local/jdk1.8.0_66 /usr/local/jdk
 ---> Running in 3e2a24de56fd
Removing intermediate container 3e2a24de56fd
 ---> 807c98672e7f
Step 8/14 : ENV JAVA_HOME /usr/local/jdk
 ---> Running in c1f21968d26c
Removing intermediate container c1f21968d26c
 ---> a24e93067d43
Step 9/14 : ENV CLASSPATH=.:$JAVA_HOME/jre/lib/rt.jar:$JAVA_HOME/lib/dt.jar:$JAVA_HOME/lib/tools.jar
 ---> Running in 1bc184124271
Removing intermediate container 1bc184124271
 ---> 50e6aa9d66f9
Step 10/14 : ENV PATH $PATH:$JAVA_HOME/bin
 ---> Running in 104d6ee96bfb
Removing intermediate container 104d6ee96bfb
 ---> 7ff4d81f456c
Step 11/14 : COPY apache-tomcat-8.5.39.tar.gz /opt
 ---> 4815155b0c9f
Step 12/14 : RUN tar zxf apache-tomcat-8.5.39.tar.gz -C /usr/local  && rm -rf /opt/apache-tomcat-8.5.39.zip
 ---> Running in b5d13adfbf93
Removing intermediate container b5d13adfbf93
 ---> 49413a5efaed
Step 13/14 : RUN mv /usr/local/apache-tomcat-8.5.39 /usr/local/tomcat
 ---> Running in a2ea891bb8b2
Removing intermediate container a2ea891bb8b2
 ---> 6c71db7365e9
Step 14/14 : ENTRYPOINT /usr/local/tomcat/bin/startup.sh && tail -f /usr/local/tomcat/logs/catalina.out
 ---> Running in f01fa6926b74
Removing intermediate container f01fa6926b74
 ---> 0686065360e3
Successfully built 0686065360e3
Successfully tagged feixiangkeji974907/tomcat-test:v8

```

 

测试下镜像，启动容器

```
 [root@master-1 app-tomcat-filebeat-log]# docker run --name tomcat -itd -p 80:8080 feixiangkeji974907/tomcat-test:v8 
```



访问tomcat:   http://192.168.31.61
可以看到首页效果

![](http://jpg.fxkjnj.com/soft/kubernetes/tomcat-1.png)





```
如果需要替换war包操作。可以将上面制作的tomcat8 镜像为基础镜像，在写一个dockerfile。我这里提供一下

cat >  Dockerfile  << EOF
FROM feixiangkeji974907/tomcat-test:v8
MAINTAINER fxkjnj.com fxkj
COPY app.war /opt
RUN unzip /opt/app.war -d /usr/local/tomcat/webapps/ && rm -rf /opt/app.war
EOF


[root@master-1 app-tomcat-filebeat-log]# docker build -t tomcat-app:v1 .
```



#### 4.2.2 创建 app-tomcat-log-logfile.yaml 文件，并加入 Filebeat 来收集tomcat容器日志

```
cat >  app-tomcat-log-logfile.yaml   << EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tomcat-logfile
spec:
  replicas: 1
  selector:
    matchLabels:
      project: tomcat-app
      app: tomcat-logfile
  template:
    metadata:
      labels:
        project: tomcat-app
        app: tomcat-logfile
    spec:
      containers:
      # 应用容器
      - name: tomcat
        image: feixiangkeji974907/tomcat-test:v8
        # 将数据卷挂载到日志目录
        volumeMounts:
        - name: tomcat-logs 
          mountPath: /usr/local/tomcat/logs
      # 日志采集器容器
      - name: filebeat
        image: elastic/filebeat:7.7.1
        args: [
          "-c", "/etc/filebeat.yml",
          "-e",
        ]
        resources:
          requests:
            cpu: 100m
            memory: 100Mi
          limits:
            memory: 500Mi
        securityContext:
          runAsUser: 0
        volumeMounts:
        # 挂载filebeat配置文件
        - name: filebeat-config
          mountPath: /etc/filebeat.yml
          subPath: filebeat.yml
        # 将数据卷挂载到日志目录
        - name: tomcat-logs 
          mountPath: /usr/local/tomcat/logs
      # 数据卷共享日志目录
      volumes:
      - name: tomcat-logs
        emptyDir: {}
      - name: filebeat-config
        configMap:
          name: filebeat-tomcat-config
---
apiVersion: v1
kind: Service
metadata:
  name: app-log-logfile
spec:
  ports:
  - port: 80
    protocol: TCP
    targetPort: 8080
  selector:
    project: tomcat-app
    app: tomcat-logfile
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: filebeat-tomcat-config
  
data:
  # 配置文件保存在ConfigMap
  filebeat.yml: |-
    filebeat.inputs:
      - type: log
        paths:
          - /usr/local/tomcat/logs/localhost_access_log.*
        # tags: ["access-log"]
        # fields_under_root，如果值为ture，那么fields 字段存储在输出文档的顶级位置，如果与filebeat中字段冲突，自定义字段会覆盖其他字段
        fields_under_root: true
        fields:
          project: tomcat-app
          app: tomcat-logfile
        #自定义ES的索引需要把ilm设置为false
        #定义模板的相关信息
    setup.ilm.enabled: false
    setup.template.name: "tomcat-access"
    setup.template.pattern: "tomcat-access-*"

    output.elasticsearch:
      index: "tomcat-access-%{+yyyy.MM.dd}"
      #elasticsearch 用户
      username: 'elastic'
      # elasticsearch 密码
      password: 'elastic123456'
      # elasticsearch 主机地址,这里要注意了,一定要加上ES的命名空间名称！！！切记
      hosts: ["elasticsearch-client.efk:9200"]
EOF



[root@master-1 app-tomcat-filebeat-log]# kubectl apply -f app-tomcat-log-logfile.yaml 
deployment.apps/tomcat-logfile created
service/app-log-logfile created
configmap/filebeat-tomcat-config created




```

#### 4.2.3 查看tomcat pod，service 状态

```
[root@master-1 app-tomcat-filebeat-log]# kubectl get pods,svc
NAME                                  READY   STATUS    RESTARTS   AGE
pod/tomcat-logfile-65bcf9f7cf-b6jgn   2/2     Running   0          9m27s

NAME                      TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)   AGE
service/app-log-logfile   ClusterIP   10.0.0.194   <none>        80/TCP    9m27s
```



#### 4.2.4 访问tomcat 的Pod 使其产生日志

```
[root@master-1 app-tomcat-filebeat-log]# curl -I 10.0.0.194
HTTP/1.1 200 
Content-Type: text/html;charset=UTF-8
Transfer-Encoding: chunked
Date: Thu, 08 Mar 2021 04:54:06 GMT
```





#### 4.2.5  登陆kibana  管理索引， 添加索引模式

索引管理：

（一般只要有数据入到ES中就会有索引出现 ，如果没有出现可以试着访问下业务使其产生日志输出到ES中）

点击👈左边的 Stack Management 中的 索引管理 可以看到一个名词为tomcat-access-2021.03.08的索引，状态为open

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-14-1.png)



添加索引模式:

点击👈左边的 Stack Management 中的索引模式，创建索引模式



![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-6-1.png)

输入索引模式名称：tomcat-access-*

表示可以匹配到上面的索引 tomcat-access-2021.03.08

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-15.png)



选择@timestamp 时间字段

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-16.png)



![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-17.png)





#### 4.2.6 登陆kibana dashboard 检索tomcat 日志

点击👈左边的Discover,选择正确的索引

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-18.png)



检索的语句：  project : "tomcat-app"

可以看到有1个 日志被命中了 

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-19.png)



![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-20.png)









