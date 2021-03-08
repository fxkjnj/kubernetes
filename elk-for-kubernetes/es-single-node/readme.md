## 部署ES 单点+ filebeat + kibana 实现Kubernetes应用日志收集 
PS: 本实验所需要的yaml 文件 都在 /kubernetes/elk-for-kubernetes/es-single-node 目录下



### 1、集群信息

| 主机名 |     IP地址     |        节点信息        |
| :----: | :------------: | :--------------------: |
| Master | 192.168.31.61  |  master 节点    8核8G  |
| Node-1 | 192.168.31.63  | node 节点       8核12G |
| Node-2 | 192.168.31.66  | node 节点       8核12G |
| Node-3 | 192.168.31.67  | node 节点       8核12G |
|  NFS   | 192.168.31.100 | nfs 存储节点    8核12G |



### 2、软件版本

|         软件名         |  版本   |  备注  |
| :--------------------: | :-----: | :----: |
|       kubernetes       | v1.18.6 |        |
|     Elasticsearch      | v7.9.2  |  单点  |
|        Filebeat        | v7.9.2  |        |
|         Kibana         | v7.9.2  |        |
| Nfs-client-provisioner | v1.2.8  | 动态PV |



### 3、部署NFS 服务

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



### 4、集群所有节点都要安装nfs-utils

```
yum -y install nfs-utils

#记住，所有节点都要安装nfs-utils，否则无法使用pv
```



### 5、部署动态PV



##### 	5.1、创建NFS  动态PV专属命名空间

```
[root@master-1 ~]# kubectl create ns nfs
namespace/nfs created
```

#####    

##### 	5.2、使用Helm 部署nfs-client-provisioner

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
replicaCount: 3
EOF

#helm 部署 nfs-client-provisioner
[root@master-1 es-single-node]# helm install elastic-nfs-storage -n nfs --values elastic-client-nfs.yaml helm-stable/nfs-client-provisioner --version 1.2.8
```

##### 5.3、查看 nfs-client-provisioner Pod 运行状态

```
[root@master-1 es-single-node]# kubectl get pods -n nfs
NAME                                                          READY   STATUS    RESTARTS   AGE
elastic-nfs-storage-nfs-client-provisioner-78c7754777-8kvlg   1/1     Running   0          28m
elastic-nfs-storage-nfs-client-provisioner-78c7754777-vtpn8   1/1     Running   0          28m
elastic-nfs-storage-nfs-client-provisioner-78c7754777-zbx8s   1/1     Running   0          28m

```

### 6、部署单节点Elasticsearch数据库

##### 6.1、创建EFK 专属命名空间

```
[root@master-1 es-single-node]# kubectl create ns ops
namespace/ops created
```

##### 6.2、创建elasticsearch.yaml 

```
cat >  elasticsearch.yaml  << EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: elasticsearch
  namespace: ops
  labels:
    k8s-app: elasticsearch
spec:
  replicas: 1
  selector:
    matchLabels:
      k8s-app: elasticsearch
  template:
    metadata:
      labels:
        k8s-app: elasticsearch
    spec:
      containers:
      - image: elasticsearch:7.9.2
        name: elasticsearch
        resources:
          limits:
            cpu: 2
            memory: 3Gi
          requests:
            cpu: 0.5 
            memory: 500Mi
        env:
          - name: "discovery.type"
            value: "single-node"
          - name: ES_JAVA_OPTS
            value: "-Xms512m -Xmx2g" 
        ports:
        - containerPort: 9200
          name: db
          protocol: TCP
        volumeMounts:
        - name: elasticsearch-data
          mountPath: /usr/share/elasticsearch/data
      volumes:
      - name: elasticsearch-data
        persistentVolumeClaim:
          claimName: es-pvc

---

apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: es-pvc
  namespace: ops
spec:
#指定动态PV 名称
  storageClassName: "elastic-nfs-client"
  accessModes:
    - ReadWriteMany
  resources:
    requests:
      storage: 10Gi

---

apiVersion: v1
kind: Service
metadata:
  name: elasticsearch
  namespace: ops
spec:
  ports:
  - port: 9200
    protocol: TCP
    targetPort: 9200
  selector:
    k8s-app: elasticsearch
EOF

[root@master-1 es-single-node]# kubectl apply -f elasticsearch.yaml 
deployment.apps/elasticsearch create
persistentvolumeclaim/es-pvc create
service/elasticsearch create
```

##### 6.3、查看elasticsearch pod,service 运行状态

```
[root@master-1 es-single-node]# kubectl get pod -n ops -l k8s-app=elasticsearch
NAME                            READY   STATUS    RESTARTS   AGE
elasticsearch-97f7d74f5-qr6d4   1/1     Running   0          2m41s


[root@master-1 es-single-node]# kubectl get service -n ops
NAME                 TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)             AGE
elasticsearch        ClusterIP   10.0.0.126   <none>        9200/TCP            2m41s

```

### 7、部署kibana  可视化展示

##### 7.1、创建kibana.yaml

```
cat >  kibana.yaml  << EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kibana
  namespace: ops
  labels:
    k8s-app: kibana
spec:
  replicas: 1
  selector:
    matchLabels:
      k8s-app: kibana
  template:
    metadata:
      labels:
        k8s-app: kibana
    spec:
      containers:
      - name: kibana
        image: kibana:7.9.2
        resources:
          limits:
            cpu: 2
            memory: 4Gi
          requests:
            cpu: 0.5 
            memory: 500Mi
        env:
          - name: ELASTICSEARCH_HOSTS
#指定elasticsearch的servicesname，记得加上命名空间.ops
            value: http://elasticsearch.ops:9200
          - name: I18N_LOCALE
            value: zh-CN
        ports:
        - containerPort: 5601
          name: ui
          protocol: TCP

---
apiVersion: v1
kind: Service
metadata:
  name: kibana
  namespace: ops
spec:
  type: NodePort
  ports:
  - port: 5601
    protocol: TCP
    targetPort: ui
    nodePort: 30601
  selector:
    k8s-app: kibana
EOF


[root@master-1 es-single-node]# kubectl apply -f kibana.yaml 
deployment.apps/kibana create
service/kibana create
```

##### 7.2、查看kibana pod,service 运行状态

```
[root@master-1 es-single-node]# kubectl get pod -n ops -l k8s-app=kibana
NAME                      READY   STATUS    RESTARTS   AGE
kibana-5c96d89b65-zgphp   1/1     Running   0          7m

[root@master-1 es-single-node]# kubectl get service -n ops
NAME                 TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)             AGE
kibana               NodePort    10.0.0.164   <none>        5601:30601/TCP      7m
```

##### 7.3、查看kibana dashboard

输入kibana 地址： http://nodeIP:30601

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-4.png)





### 8、日志收集

#### 8.1、收集容器标准输出日志

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-8-1.png)

大致思路：

​       以DaemonSet方式在每个Node上部署一个Filebeat 的日志收集程序的Pod，采用hostPath 方式把 /var/lib/docker/containers 挂载到Filebeat 容器中，/var/lib/docker/containers 目录下的就是每个容器标准输出的日志

##### 8.1.1 创建 filebeat-kubernetes.yaml

```
cat >  filebeat-kubernetes.yaml << EOF
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: filebeat-config
  namespace: ops
  labels:
    k8s-app: filebeat
data:
  filebeat.yml: |-
    filebeat.config:
      inputs:
        # Mounted `filebeat-inputs` configmap:
        path: ${path.config}/inputs.d/*.yml
        # Reload inputs configs as they change:
        reload.enabled: false
      modules:
        path: ${path.config}/modules.d/*.yml
        # Reload module configs as they change:
        reload.enabled: false

    output.elasticsearch:
      hosts: ['elasticsearch.ops:9200']
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: filebeat-inputs
  namespace: ops
  labels:
    k8s-app: filebeat
data:
  kubernetes.yml: |-
    - type: docker
      containers.ids:
      - "*"
      processors:
        - add_kubernetes_metadata:
            in_cluster: true
---
apiVersion: apps/v1 
kind: DaemonSet
metadata:
  name: filebeat
  namespace: ops
  labels:
    k8s-app: filebeat
spec:
  selector:
    matchLabels:
      k8s-app: filebeat
  template:
    metadata:
      labels:
        k8s-app: filebeat
    spec:
      serviceAccountName: filebeat
      terminationGracePeriodSeconds: 30
      containers:
      - name: filebeat
        image: elastic/filebeat:7.9.2
        args: [
          "-c", "/etc/filebeat.yml",
          "-e",
        ]
        securityContext:
          runAsUser: 0
          # If using Red Hat OpenShift uncomment this:
          #privileged: true
        resources:
          limits:
            memory: 200Mi
          requests:
            cpu: 100m
            memory: 100Mi
        volumeMounts:
        - name: config
          mountPath: /etc/filebeat.yml
          readOnly: true
          subPath: filebeat.yml
        - name: inputs
          mountPath: /usr/share/filebeat/inputs.d
          readOnly: true
        - name: data
          mountPath: /usr/share/filebeat/data
        - name: varlibdockercontainers
          mountPath: /var/lib/docker/containers
          readOnly: true
      volumes:
      - name: config
        configMap:
          defaultMode: 0600
          name: filebeat-config
      - name: varlibdockercontainers
        hostPath:
          path: /var/lib/docker/containers
      - name: inputs
        configMap:
          defaultMode: 0600
          name: filebeat-inputs
      # data folder stores a registry of read status for all files, so we don't send everything again on a Filebeat pod restart
      - name: data
        hostPath:
          path: /var/lib/filebeat-data
          type: DirectoryOrCreate
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: filebeat
subjects:
- kind: ServiceAccount
  name: filebeat
  namespace: ops
roleRef:
  kind: ClusterRole
  name: filebeat
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: filebeat
  labels:
    k8s-app: filebeat
rules:
- apiGroups: [""] # "" indicates the core API group
  resources:
  - namespaces
  - pods
  verbs:
  - get
  - watch
  - list
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: filebeat
  namespace: ops
  labels:
    k8s-app: filebeat
EOF

[root@master-1 es-single-node]# kubectl apply -f filebeat-kubernetes.yaml 
configmap/filebeat-config create
configmap/filebeat-inputs create
daemonset.apps/filebeat create
clusterrolebinding.rbac.authorization.k8s.io/filebeat create
clusterrole.rbac.authorization.k8s.io/filebeat create
serviceaccount/filebeat create
```

##### 8.1.2 查看Filebeat pod 运行状态

```
[root@master-1 es-single-node]# kubectl get pods -n ops -l k8s-app=node-exporter
NAME                  READY   STATUS    RESTARTS   AGE
node-exporter-j72cb   1/1     Running   10         13d
node-exporter-k6d7v   1/1     Running   10         13d
node-exporter-vhgns   1/1     Running   10         13d
```

##### 8.1.3 登陆kibana  管理索引， 添加索引模式

索引管理：

（一般只要有数据入到ES中就会有索引出现 ，如果没有出现可以试着访问下业务使其产生日志输出到ES中）

点击👈左边的 Stack Management 中的 索引管理 可以看到一个名词为filebeat-7.9.2-2021.03.01-000001的索引，状态为open

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

##### 8.1.4 启动一个nginx 的Pod，验证日志数据

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

##### 8.1.5 查看nginx pod,service 状态

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



##### 8.1.6 访问nginx 的Pod 使其产生日志

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



##### 8.1.7 登陆kibana dashboard 检索nginx 日志

检索的语句： kubernetes.namespace : "default" and message : "curl"

可以看到有1个 日志被命中了 

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-13.png)



#### 8.2、收集容器中日志文件

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-8-2.png)

大致思路：

​     在Pod中增加一个容器运行日志采集器，使用emtyDir共享日志目录让日志采集器读取到业务容器的日志文件



PS:  收集容器中日志文件所需要的Pod Yaml 文件 在 https://github.com/fxkjnj/kubernetes/elk-for-kubernetes/es-single-node/app-tomcat-filebeat-log  目录下 



##### 8.2.1 编写dockerfile，创建 一个标准的tomcat8 镜像

PS: 确保本机有docker 的环境, 如果没有部署docker 可以参考我的另一篇文章

https://www.fxkjnj.com/?p=2732

😁当然如果不想自己制作镜像，也可以使用我制作好的tomcat8 镜像 docker pull feixiangkeji974907/tomcat-test:v8 



创建软件目录，下载tomcat8,  jdk1.8 

[root@master-1 es-single-node]# mkdir  app-tomcat-filebeat-log

```
[root@master-1 es-single-node]# cd app-tomcat-filebeat-log
[root@master-1 app-tomcat-filebeat-log]# http://jpg.fxkjnj.com/ruanjian/apache-tomcat-8.5.39.tar.gz
[root@master-1 app-tomcat-filebeat-log]# http://jpg.fxkjnj.com/ruanjian/jdk1.8.0_66.tar.gz

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



##### 8.2.2 创建 app-tomcat-log-logfile.yaml 文件，并加入 Filebeat 来收集tomcat容器日志

```
cat >  app-tomcat-log-logfile.yaml   << EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tomcat-logfile
spec:
  replicas: 3
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
        image: elastic/filebeat:7.9.2 
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
      hosts: ['elasticsearch.ops:9200']
      index: "tomcat-access-%{+yyyy.MM.dd}"
EOF



[root@master-1 app-tomcat-filebeat-log]# kubectl apply -f app-tomcat-log-logfile.yaml 
deployment.apps/tomcat-logfile created
service/app-log-logfile created
configmap/filebeat-tomcat-config created




```

##### 8.2.3 查看tomcat pod，service 状态

```
[root@master-1 es-single-node]# kubectl get pods
NAME                              READY   STATUS    RESTARTS   AGE
tomcat-logfile-694d588b78-7k97g   2/2     Running   0          5m36s
tomcat-logfile-694d588b78-phnxt   2/2     Running   0          5m36s
tomcat-logfile-694d588b78-vmp25   2/2     Running   0          5m36s

[root@master-1 es-single-node]# kubectl get svc
NAME              TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)   AGE
app-log-logfile   ClusterIP   10.0.0.194   <none>        80/TCP    5m40s


```



##### 8.2.4  登陆kibana  管理索引， 添加索引模式

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





##### 8.2.5 访问tomcat 的Pod 使其产生日志

```
[root@node-1 ~]# curl -I 10.0.0.194
HTTP/1.1 200 
Content-Type: text/html;charset=UTF-8
Transfer-Encoding: chunked
Date: Mon, 08 Mar 2021 10:11:17 GMT
```



##### 8.2.6 登陆kibana dashboard 检索tomcat 日志

点击👈左边的Discover,选择正确的索引

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-18.png)



检索的语句：  project : "tomcat-app"

可以看到有1个 日志被命中了 

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-19.png)



![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-20.png)

