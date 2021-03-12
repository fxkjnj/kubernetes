##  Helm3 部署 ElasticSearch集群 & Kibana7



## 一、前言： 

- Elasticsearch 是一个分布式的搜索和分析引擎，可以用于全文检索、结构化检索和分析，并能将这三者结合起来。

   

- Kibana 是一个为 Elasticsearch 平台分析和可视化的开源平台，使用 Kibana 能够搜索、展示存储在 Elasticsearch 中的索引数据。使用它可以很方便用图表、表格、地图展示和分析数据。

  

- Helm： Helm是一个Kubernetes的包管理工具，就像Linux下的包管理器，如yum/apt等，可以很方便的将之前打包好的yaml文件部署到kubernetes上。本文采用的是helm 3.0 版本（相比v2版本最大变化是将Tiller组件删除，并大部分代码重构）



## 二、资源信息



|   集群名称    |     节点类型      | 副本数目 | 存储大小 |     网络模式      | 描述                                     |
| :-----------: | :---------------: | :------: | :------: | :---------------: | :--------------------------------------- |
| elasticsearch | Kubernetes Master |    2     |   5Gi    |     ClusterIP     | 主节节点，用于控制 ES 集群               |
| elasticsearch |  Kubernetes Data  |    3     |   50Gi   |     ClusterIP     | 数据节点，用于存储 ES 数据               |
| elasticsearch | Kubernetes Client |    2     |    无    | NodePort（30200） | 负责处理用户请求，实现请求转发、负载均衡 |



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

😁也可以直接使用我创建好的证书，在https://github.com/fxkjnj/kubernetes/tree/main/helm-for-kubernetes/elasticsearch/certificate 目录下

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

👉 ElasticSearch 相关的Yaml 文件，在https://github.com/fxkjnj/kubernetes/tree/main/helm-for-kubernetes/elasticsearch/es-cluster-yaml 目录下



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













