## jenkins 在Kubernetes中持续部署

资产信息：

|  主机名（IP）  |            用途            |  版本  |
| :------------: | :------------------------: | :----: |
| 192.168.31.100 | Harbor镜像仓库，NFS 服务器 | v2.1.0 |
| 192.168.31.200 |      Gitlab 代码仓库       | latest |
| 192.168.31.61  |      K8s-master 节点       | v1.18  |
| 192.168.31.62  |         node-1节点         | v1.18  |
| 192.168.31.63  |         node-2节点         | v1.18  |



# 一、了解发布流程

![](http://jpg.fxkjnj.com/soft/jenkins/cicd-jenkins-k8s.png)

流程：

- 拉取代码  git checkout
- 编译代码  mvn clean 
- 打包镜像 并上传镜像仓库
- 使用yaml 模板文件部署用镜像仓库中的镜像，kubectl 命令部署pod
- 开发测试



# 二、使用 Gitlab 作为代码仓库 & 使用 Harbor 作为镜像仓库

## 2.1 部署Harbor作为镜像仓库

部署方式： 采用方式docker-compose部署docker容器

下载地址:  https://github.com/goharbor/harbor/releases/tag/v2.1.0

```
[root@harbor ~]# wget https://github.com/goharbor/harbor/releases/download/v2.1.0/harbor-offline-installer-v2.1.0.tgz

[root@harbor ~]# tar -zxf harbor-offline-installer-v2.1.0.tgz -C /opt/

```



编辑harbor配置文件：

先备份：

 [root@harbor ~]#  cp /opt/harbor/harbor.yml /opt/harbor/harbor.yml-bak

[root@harbor ~]#  vim /opt/harbor/harbor.yml

```
# https related config											   #不做HTTPS 可以把Https 那几行给注释掉
#https:
# https port for harbor, default is 443
# port: 443
													
hostname: 192.168.31.100	   						 	  	 #直接用IP地址访问

port: 80										 							 		 #nginx服务端口

harbor_admin_password: Harbor12345      		   #harbor管理员密码

data_volume: /opt/harbor/data		       				 #harbor 数据目录,需提前创建好该目录

location: /opt/harbor/logs                     #harbor 日志存放路径,需提前创建好该目录
```



```
#创建Harbor数据目录和日志目录：
[root@harbor ~]# mkdir -p /opt/harbor/data  

[root@harbor ~]# mkdir -p /opt/harbor/logs
```



安装docker-compose：

​		Docker Compose是 docker 提供的一个命令行工具，用来定义和运行由多个容器组成的应用。使用 compose，我们可以通过 YAML 文件声明式的定义应用程序的各个服务，并由单个命令完成应用的创建和启动。

```
[root@harbor ~]# yum install docker-compose -y 
```



执行harbor脚本：

备注： 在部署harbor 厂库的时候，记得启用Harbor的Chart仓库服务(--with-chartmuseum)，Helm 可以把打包好的chart 放入到harbor 中。

```
[root@harbor ~]#  bash /opt/harbor/install.sh  --with-chartmuseum

安装输出过程省略........
Creating registry ... done
Creating harbor-core ... done
[Step 3]: starting Harbor ...
Creating harbor-portal ... done
Creating nginx ... done
Creating harbor-db ... 
Creating registryctl ... 
Creating registry ... 
Creating redis ... 
Creating harbor-core ... 
Creating harbor-portal ... 
Creating harbor-jobservice ... 
Creating nginx ... 

✔ ----Harbor has been installed and started successfully.----
```

当看到successfully 的时候 表示harbor 镜像仓库安装成功

docker-compose ps  可以看到正在运行的容器

```
[root@ansible harbor]#  docker-compose ps
      Name                     Command               State             Ports          
--------------------------------------------------------------------------------------
chartmuseum         ./docker-entrypoint.sh           Up                               
harbor-core         /harbor/entrypoint.sh            Up                               
harbor-db           /docker-entrypoint.sh            Up                               
harbor-jobservice   /harbor/entrypoint.sh            Up                               
harbor-log          /bin/sh -c /usr/local/bin/ ...   Up      127.0.0.1:1514->10514/tcp
harbor-portal       nginx -g daemon off;             Up                               
nginx               nginx -g daemon off;             Up      0.0.0.0:80->8080/tcp     
redis               redis-server /etc/redis.conf     Up                               
registry            /home/harbor/entrypoint.sh       Up                               
registryctl         /home/harbor/start.sh            Up          
```



访问Harbor 的web 控制台

![](http://jpg.fxkjnj.com/soft/devops-other/harbor-4.png)



新建项目：

​	项目名称： fxkj

​	访问级别： 公开

![](http://jpg.fxkjnj.com/soft/devops-other/harbor-2.png)

可以看到 harbor 仓库中 fxkj 项目已经创建好了



![](http://jpg.fxkjnj.com/soft/devops-other/harbor-3.png)





## 2.2 部署Gitlab作为代码仓库

部署方式： 

​				官网上docker 的部署gitlab-ce的方式



```
[root@gitlab ~]# export GITLAB_HOME=/opt/gitlab


[root@gitlab ~]# docker run --detach \
  --publish 443:443 \
  --publish 80:80 \
  --publish 2222:22 \
  --name gitlab \
  --restart always \
  --volume $GITLAB_HOME/config:/etc/gitlab \
  --volume $GITLAB_HOME/logs:/var/log/gitlab \
  --volume $GITLAB_HOME/data:/var/opt/gitlab \
  gitlab/gitlab-ce:latest
  
  
  
[root@gitlab ~]# docker ps
CONTAINER ID        IMAGE                     COMMAND             CREATED             STATUS                   PORTS                                                            NAMES
5df8d498914a        gitlab/gitlab-ce:latest   "/assets/wrapper"   2 weeks ago         Up 3 hours (unhealthy)   0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp, 0.0.0.0:2222->22/tcp   gitlab

```



打开浏览器，访问gitlab ：

登陆后会提示让你修改密码

![](http://jpg.fxkjnj.com/soft/devops-other/gitlab-1.png)



新建群组



![](http://jpg.fxkjnj.com/soft/devops-other/gitlab-2.png)

输入 群组名称： fxkj

可见性级别： 🔐 私有（也就是群组及其项目只能由成员查看）

![](http://jpg.fxkjnj.com/soft/devops-other/gitlab-3.png)

新建项目



![](http://jpg.fxkjnj.com/soft/devops-other/gitlab-4.png)



创建空白项目



![](http://jpg.fxkjnj.com/soft/devops-other/gitlab-5.png)



输入项目名称： app

可见性级别： 🔐 私有  



![](http://jpg.fxkjnj.com/soft/devops-other/gitlab-6.png)



可以看到一个新的空仓库就创建成功了



![](http://jpg.fxkjnj.com/soft/devops-other/gitlab-7.png)



# 三、在 Kubernetes 中部署 Jenkins

## 3.1 在 Kubernetes 中部署jenkins 

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-1.png)

### 3.1.1 给jenkins创建动态PVC卷

使用NFS 作为后端的存储，使用动态PV 的自动供给 为Jenkins持久化数据。

部署NFS 服务( 192.168.31.100 主机上 ）

```bash
#   创建 NFS 存储目录
mkdir -p /home/cicd
#   安装nfs服务
yum -y install nfs-utils rpcbind
#   修改配置文件
echo "/home/cicd *(rw,sync,no_root_squash,no_subtree_check)" >> /etc/exports
#   启动服务
systemctl start nfs && systemctl start rpcbind
#   设置开机启动
systemctl enable nfs-server && systemctl enable rpcbind
```



K8S集群所有节点都要安装nfs-utils

```
yum -y install nfs-utils

#记住，所有节点都要安装nfs-utils，否则无法使用pv
```



部署动态PV

创建NFS  动态PV专属命名空间

```
[root@master-1 ~]# kubectl create ns nfs
namespace/nfs created
```



使用Helm 部署nfs-client-provisioner

```
注意事项：
		（1）、nfs-client-provisioner部署到刚刚创建的nfs命名空间下
		（2）、storageClass.name #指定storageClassName名称，用于 PVC 自动绑定专属动态 PV 上
		（3）、需要指定NFS服务器的IP 地址(192.168.31.100)，以及共享名称路径(/home/cicd)
```

```bash
#添加helm charts repo
[root@master-1 ~]# helm repo add helm-stable https://charts.helm.sh/stable        
[root@master-1 ~]# helm repo update

cat >  jenkins-client-nfs.yaml << EOF
# NFS 设置
nfs:
  server: 192.168.31.100
  path: /home/cicd
storageClass:
  # 此配置用于绑定 PVC 和 PV
  name: jenkins-nfs-client
  
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
[root@master-1 ~]# helm install jenkins-nfs-storage -n nfs --values jenkins-client-nfs.yaml helm-stable/nfs-client-provisioner --version 1.2.8
```



查看 nfs-client-provisioner Pod 运行状态，查看storageclass状态

```
[root@master-1 ~]# kubectl get pods -n nfs
NAME                                                          READY   STATUS    RESTARTS   AGE
jenkins-nfs-storage-nfs-client-provisioner-6db6c5cb9-l7rm5    1/1     Running   0          12s


[root@master-1 ~]# kubectl get storageclass
NAME                 PROVISIONER                                                RECLAIMPOLICY   VOLUMEBINDINGMODE   ALLOWVOLUMEEXPANSION   AGE
jenkins-nfs-client   cluster.local/jenkins-nfs-storage-nfs-client-provisioner   Retain          Immediate           true                   15s
```



### 3.1.2 编写jenkins.yaml

yaml文件在https://github.com/fxkjnj/kubernetes/tree/main/jenkins-for_kubernetes/jenkins 目录下

```
[root@master-1 jenkins]# cat > jenkins.yml << EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: jenkins
  namespace: ops
  labels:
    name: jenkins
spec:
  replicas: 1
  selector:
    matchLabels:
      name: jenkins 
  template:
    metadata:
      name: jenkins
      labels:
        name: jenkins
    spec:
      serviceAccountName: jenkins
      containers:
        - name: jenkins
          image: jenkins/jenkins
          ports:
            - containerPort: 8080
            - containerPort: 50000
          resources:
            limits:
              cpu: 2
              memory: 4Gi
            requests:
              cpu: 1
              memory: 1Gi
          env:
            - name: LIMITS_MEMORY
              valueFrom:
                resourceFieldRef:
                  resource: limits.memory
                  divisor: 1Mi
            - name: JAVA_OPTS
              value: -Xmx$(LIMITS_MEMORY)m -XshowSettings:vm -Dhudson.slaves.NodeProvisioner.initialDelay=0 -Dhudson.slaves.NodeProvisioner.MARGIN=50 -Dhudson.slaves.NodeProvisioner.MARGIN0=0.85
          volumeMounts:
            - name: jenkins-home
              mountPath: /var/jenkins_home
      securityContext:
        fsGroup: 1000
      volumes:
      - name: jenkins-home
        persistentVolumeClaim:
          claimName: jenkins
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: jenkins
  namespace: ops
spec:
  storageClassName: "jenkins-nfs-client"
  accessModes:
    - ReadWriteMany
  resources:
    requests:
      storage: 10Gi
---
apiVersion: v1
kind: Service
metadata:
  name: jenkins
  namespace: ops
spec:
  selector:
    name: jenkins
  type: NodePort
  ports:
    - name: http
      port: 80
      targetPort: 8080
      protocol: TCP
      nodePort: 30008
    - name: agent
      port: 50000
      protocol: TCP
---
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: jenkins
  namespace: ops

---
kind: Role
apiVersion: rbac.authorization.k8s.io/v1
metadata:
  name: jenkins
  namespace: ops
rules:
- apiGroups: [""]
  resources: ["pods","events"]
  verbs: ["create","delete","get","list","patch","update","watch"]
- apiGroups: [""]
  resources: ["pods/exec"]
  verbs: ["create","delete","get","list","patch","update","watch"]
- apiGroups: [""]
  resources: ["pods/log"]
  verbs: ["get","list","watch"]
- apiGroups: [""]
  resources: ["secrets","events"]
  verbs: ["get"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: jenkins
  namespace: ops
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: jenkins
subjects:
- kind: ServiceAccount
  name: jenkins
EOF


[root@master-1 jenkins]# kubectl apply -f jenkins.yaml


[root@master-1 jenkins]# kubectl get pvc,pods,svc -n ops -o wide
NAME                               STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS         AGE     VOLUMEMODE
persistentvolumeclaim/jenkins      Bound    pvc-368e554e-343d-40d2-9bb1-28368582b652   5Gi        RWX            jenkins-nfs-client   8d      Filesystem


NAME                          READY   STATUS    RESTARTS   AGE    IP             NODE     NOMINATED NODE   READINESS GATES
pod/jenkins-dccd449c7-nxfhk   1/1     Running   0          176m   10.244.1.252   node-2   <none>           <none>


NAME              TYPE       CLUSTER-IP   EXTERNAL-IP   PORT(S)                        AGE   SELECTOR
service/jenkins   NodePort   10.0.0.180   <none>        80:30008/TCP,50000:30002/TCP   8d    name=jenkins


```

### 3.1.3 访问jenkins控制台，初始化环境

访问地址：http://NodePort:30008

例如： http://192.168.31.61:30008

第一次部署会进行初始化：

查看密码，可以去查看jenkins 的启动日志

```
[root@master-1 jenkins]# kubectl logs -n ops jenkins-dccd449c7-nxfhk
```



![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-2.png)

部署插件这块，选择插件来安装



![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-3.png)

点击“无”，不安装任何插件

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-4-1.png)



创建管理员账号

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-5.png)

### 3.1.4 安装插件

默认从国外网络下载插件，会比较慢，建议修改成国内源：

只需要到nfs上，修改PVC挂载的内容即可

```
# 进入到nfs共享目录
[root@nfs-server ~]# cd /home/cicd/ops-jenkins-pvc-368e554e-343d-40d2-9bb1-28368582b652


[root@nfs-server ops-jenkins-pvc-368e554e-343d-40d2-9bb1-28368582b652]# cd updates

#先备份好配置文件
[root@nfs-server updates]# cp default.json default.json-bak

#修改插件的下载地址为国内的地址
sed -i 's/https:\/\/updates.jenkins.io\/download/https:\/\/mirrors.tuna.tsinghua.edu.cn\/jenkins/g'
default.json


#修改jenkins启动时检测的URL网址，改为国内baidu的地址
sed -i 's/http:\/\/www.google.com/https:\/\/www.baidu.com/g' default.json

```



删除pod重建（pod名称改成你实际的）

[root@master-1 jenkins]# kubectl delete pod jenkins-dccd449c7-nxfhk -n ops



修改完后，jenkins 会重建，打开浏览器访问:  http://NodePort:30008

输入账户密码从新登陆jenkins控制台

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-6.png)

依次点击  管理Jenkins（Manage Jenkins）->系统配置(System Configuration)-->管理插件(Manage Pluglns)-->

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-7.png)





分别搜索 Git/Git Parameter/Pipeline/kubernetes/Config File Provider，选中点击安装。

安装插件可能会失败，多试几次就好了，安装完记得重启Pod

| 插件名称             | 用途                                               |
| -------------------- | -------------------------------------------------- |
| Git                  | 用于拉取代码                                       |
| Git Parameter        | 用于Git参数化构建                                  |
| Pipeline             | 用于流水线                                         |
| kubernetes           | 用于连接Kubernetes动态创建Slave代理                |
| Config File Provider | 用于存储kubectl用于连接k8s集群的kubeconfig配置文件 |

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-8.png)











## 3.2 jenkins在K8S中动态创建代理

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-10.png)

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-11.png)



### 3.2.1 在jenkins中添加kubernetes云

管理Jenkins->Manage Nodes and Clouds->configureClouds->Add



输入Kubernetes 地址：  https://kubernetes.default ，点击连接测试，测试通过的话，会显示k8s的版本信息

输入Jenkins 地址：   http://jenkins.ops  

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-9.png)



### 3.2.2 构建Jenkins-Slave镜像

PS:  jenkins 官方有jenkins-slave 制作好的镜像，可以直接 docker pull jenkins/jnlp-slave  下载到本地并上传本地私有镜像厂库。官方的镜像好处就是不需要再单独安装maven,kubectl 这样的命令了，可以直接使用。



构建镜像所需要的文件：

#在https://github.com/fxkjnj/kubernetes/tree/main/jenkins-for_kubernetes/jenkins-slave 目录下

- Dockerfile：构建镜像文件
- jenkins-slave：shell脚本，用于启动slave.jar
- settings.xml： 修改maven官方源为阿里云源
- slave.jar：agent程序，接受master下发的任务（slave.jar  jar 包文件 可以在jenkins 添加slave-node 节点，获取到 jar 包文件）



这里主要看下 Dockerfile 文件的内容：

```
[root@master-1 jenkins-slave]# cat > Dockerfile << EOF
FROM centos:7
LABEL fxkjnj.com fxkj

RUN yum install -y java-1.8.0-openjdk maven curl git libtool-ltdl-devel && \ 
    yum clean all && \
    rm -rf /var/cache/yum/* && \
    mkdir -p /usr/share/jenkins

COPY slave.jar /usr/share/jenkins/slave.jar  
COPY jenkins-slave /usr/bin/jenkins-slave
COPY settings.xml /etc/maven/settings.xml
RUN chmod +x /usr/bin/jenkins-slave
COPY kubectl /usr/bin/

ENTRYPOINT ["jenkins-slave"]
EOF
```



使用 docker build 构建镜像,并上传至镜像厂库

```
# docker build 构建镜像
[root@master-1 jenkins-slave]# docker build -t 192.168.31.100/library/jenkins-slave-jdk:1.8 .


#登陆Harbor厂库
[root@master-1 ~]# docker login 192.168.31.100

Authenticating with existing credentials...
WARNING! Your password will be stored unencrypted in /root/.docker/config.json.
Configure a credential helper to remove this warning. See
https://docs.docker.com/engine/reference/commandline/login/#credentials-store
Login Succeeded


#上传镜像至Harbor厂库
[root@master-1 ~]# docker push 192.168.31.100/library/jenkins-slave-jdk:1.8
The push refers to repository [192.168.31.100/library/jenkins-slave-jdk]
95373428525d: Layer already exists 
e21625090e9e: Layer already exists 
7bcc9418aaf9: Layer already exists 
f9571abf8769: Layer already exists 
e244dbf0dbc2: Layer already exists 
9e25c54b402b: Layer already exists 
174f56854903: Layer already exists 
1.8: digest: sha256:6887867447794c28401a90fab596537d569af2bfed7071b90e7d6a7fab9f152b size: 1786

```



登陆harbor 仓库 WEB控制台，可以看到已经上传上来的镜像

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-12.png)



在jenkins 中创建一个流水线项目，测试jenkins-slave 是否功能



![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-13.png)



在pipeline 中 编写脚本，pipeline 脚本分为  声明式 和 脚本式

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-15.png)

我这里写 声明式 脚本

需要注意的是，spec 中定义containers的名字一定要写jnlp

```
pipeline {
    agent {
        kubernetes {
            yaml '''
apiVersion: v1          
kind: Pod
metadata:
  name: jenkins-slave
spec:
  containers:
  - name: jnlp
    image: 192.168.31.100/library/jenkins-slave-jdk:1.8
'''

        }
    }
    stages {
        stage('测试') {
            steps {
                sh 'hostname'
            }
        }
    }
}
```



点击Build New 按钮，开始构建



![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-16.png)



构建结束后，点击项目编号，可以查看jenkins 构建的日志

日志中可以看到 输出了主机名

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-17.png)

同时在构建的时候，K8S 集群中的ops 命名空间下，临时起了一个pod，这个Pod就是 jenkins 动态创建的代理，用于执行jenkins master 下发的任务

当jenkins 构建的任务完成后，这个pod会自动销毁

```
[root@master-1 app]# kubectl get pods -n ops
NAME                       READY   STATUS    RESTARTS   AGE
jenkins-dccd449c7-nxfhk    1/1     Running   0          6h35m
test-3-df2fg-pbbz2-vfn3h   1/1     Running   0          8s


[root@master-1 app]# kubectl get pods -n ops
NAME                      READY   STATUS    RESTARTS   AGE
jenkins-dccd449c7-nxfhk   1/1     Running   0          6h41m

```

### 3.2.3 给 Jenkins-Slave pod 添加存储卷，以及挂载docker 命令到Pod 中

因为每次maven 打包会产生依赖的库文件，为了加快每次编译打包的速度，我们可以创建一个pvc 用来存储maven 每次打包产生的依赖文件。以及 我们需要将 k8s 集群 node 主机上的docker 命令挂载到Pod 中，用于镜像的打包 ，推送



直接创建pvc, 这里使用的动态补给的PV（直接使用上面以及创建好一个jenkins-nfs-client  storageClass ）

```
[root@master-1 jenkins-slave]#cat > pvc.yaml << EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mavencache
spec:
  storageClassName: "jenkins-nfs-client"
  accessModes:
    - ReadWriteMany     
  resources:
    requests:
      storage: 10Gi
EOF     
      
[root@master-1 jenkins-slave]# kubectl apply -f pvc.yaml -n ops
persistentvolumeclaim/mavencache created


[root@master-1 jenkins-slave]# kubectl get pvc -n ops
NAME              STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS         AGE
jenkins           Bound    pvc-368e554e-343d-40d2-9bb1-28368582b652   5Gi        RWX            jenkins-nfs-client   10d
mavencache        Bound    pvc-e56f31f9-f6b8-42ff-b8ed-6a65f52c24d6   20Gi       RWX            jenkins-nfs-client   9d

```



 Jenkins-Slave pod   yaml内容

```
apiVersion: v1          
kind: Pod
metadata:
  name: jenkins-slave
spec:
  containers:
  - name: jnlp
    image: 192.168.31.100/library/jenkins-slave-jdk:1.8
    imagePullPolicy: Always
    volumeMounts:
      - name: docker-cmd
        mountPath: /usr/bin/docker
      - name: docker-sock
        mountPath: /var/run/docker.sock
      - name: maven-cache
        mountPath: /root/.m2

  volumes:
    - name: docker-cmd
      hostPath:
        path: /usr/bin/docker
    - name: docker-sock
      hostPath:
        path: /var/run/docker.sock
    - name: maven-cache
      persistentVolumeClaim:
        claimName: mavencache       
```



# 四、Jenkins在Kubernetes中持续部署

案例： 使用Jenkins在Kubernetes中持续部署一个无状态的tomcat pod 应用

项目代码路径：https://github.com/fxkjnj/kubernetes/tree/main/jenkins-for_kubernetes/app



上面的harbor镜像仓库，gitlab 代码仓库，jenkins 发布平台都已经部署完成，现在我们需要使用Jenkins在Kubernetes中持续部署一个无状态的tomcat  应用



具体流程如下：

1. 拉取代码  git checkout
2. 编译代码  mvn clean 
3. 打包镜像 并上传镜像仓库
4. 使用yaml 模板文件部署用镜像仓库中的镜像，kubectl 命令部署pod
5. 开发测试







## 4.1 拉取代码  git checkout

### 4.1.1、本地上传项目代码到gitlab 仓库中



上面我们已经在gitlab 中创建了一个app 的空仓库，仓库地址： http://192.168.31.200/fxkj/app.git

现在我们需要上传项目的代码到app 仓库中



推送现有文件夹

```
cd app
git init
git remote add origin http://192.168.31.200/fxkj/app.git
git add .
git commit -m "Initial commit"
git push -u origin master
```



推送到仓库后，可以看到项目代码

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-18.png)



### 4.1.2、 生成拉取git 代码的Pipeline 脚本

登陆jenkins 控制器，使用凭据的方式保存 git 账户信息 和 harbor 账户信息

用于jenkins 从gitlab 中拉取代码

Manage Jenkins -> Manage Credentials -> 全局凭据 (unrestricted)  -> Add Credentials 

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-19-3.png)



选择Kind 类型 为 username with passwd

输入账户名，密码

添加一个描述信息



![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-19-4.png)



使用pipeline 生成 git 拉取代码的语法

jenkins 官方提供一个pipeline 语法的生成器

任意创建一个流水线项目

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-13.png)

在pipeline 选项那里点击 ， pipeline Syntax

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-19-5.png)

点击片段生成器，在sample step 下拉选项框 中 找到 checkout: check out from version control

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-19-7.png)



输入Repository URL(代码仓库地址):		 http://192.168.31.200/fxkj/app.git

点击Credentials 选择 刚刚创建的git 的用户凭证

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-19-8.png)

最后点击 Generate Pipeline Script 生产pipeline 语法

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-19-9.png)

也就是 下面这段话,有了这个我们就可以在jenkins 上去拉取仓库里的代码了

```
checkout([$class: 'GitSCM', branches: [[name: '*/master']], extensions: [], userRemoteConfigs: [[credentialsId: 'bcf76dc6-d1d0-4611-a50c-e462eede257a', url: 'http://192.168.31.200/fxkj/app.git']]])
```



## 4.2 编译代码  mvn clean 

在上面构建Jenkins-Slave镜像的时候，我们已经在镜像里安装了maven 编译代码的软件

只需要代码的路径下执行一条命令即可

```
mvn clean package -Dmaven.skip.test=true
```



## 4.3 docker 打包镜像 并上传镜像仓库



### 4.3.1 编写dockerfile，创建 一个标准的tomcat8 基础镜像

😁 当然如果不想自己制作镜像，也可以使用我制作好的tomcat8 镜像 docker pull feixiangkeji974907/tomcat-test:v8



创建软件目录，下载tomcat8, jdk1.8

[root@master-1 tmp]# mkdir app-tomcat-filebeat-log

```
[root@master-1 tmp]# cd app-tomcat-filebeat-log
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
[root@master-1 app-tomcat-filebeat-log]# docker build -t 192.168.31.100/library/tomcat8:latest .
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
 [root@master-1 app-tomcat-filebeat-log]# docker run --name tomcat -itd -p 80:8080 192.168.31.100/library/tomcat8:latest
```

访问tomcat: [http://192.168.31.61](http://192.168.31.61/) 可以看到首页效果

[![img](https://camo.githubusercontent.com/04a6d2bcb3e95104658dc05b61e2eb0973ad118b69b73e323b0f661e1f785e87/687474703a2f2f6a70672e66786b6a6e6a2e636f6d2f736f66742f6b756265726e657465732f746f6d6361742d312e706e67)](https://camo.githubusercontent.com/04a6d2bcb3e95104658dc05b61e2eb0973ad118b69b73e323b0f661e1f785e87/687474703a2f2f6a70672e66786b6a6e6a2e636f6d2f736f66742f6b756265726e657465732f746f6d6361742d312e706e67)



### 4.3.2 制作项目镜像，上传镜像至Harbor仓库

有了上面的tomcat8 基础镜像，我们 就可以吧打包好的war 包直接放入到基础镜像中，打包生成项目镜像

注意： Dockerfile 文件必须和 项目的代码 在同一个路径下（否则无法把打包好的war 包放入镜像中）

Dockerfile 文件在 https://github.com/fxkjnj/kubernetes/tree/main/jenkins-for_kubernetes/app 目录下



编写Dockerfile

```
cat >  Dockerfile  << EOF
FROM 192.168.31.100/library/tomcat8:latest
LABEL fxkjnj fxkjnj.com
RUN rm -rf /usr/local/tomcat/webapps/*
ADD target/*.war /usr/local/tomcat/webapps/ROOT.war 
```



构建镜像 ：    						docker build -t  ${image_name}   .
登陆Harbor仓库：                docker login -u ${username} -p '${password}' ${registry}
上次镜像至仓库：                 docker push ${image_name}



变量解释：

 ${image_name}  			 表示构建后的镜像名称（这里的镜像名称的标签名，每次都是不一样的，BUILD_NUMBER 为 jenkins 内置变量，jenkins 构建编号）

${username} 					表示登陆Harbor的用户名

${password}					  表示登陆Harbor的密码

${registry}						  表示Harbor镜像仓库地址



在Jenkins pipeline中，有时需要带用户名密码执行命令，如docker login，将用户名密码以明文方式放到pipeline中显然是不安全的。这时可以通过credential插件实现。下面介绍具体方法：



第一步 安装Jenkins插件
在Jenkins中安装 ‘Credentials Plugin’插件

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-19-10.png)



第二步 在凭证中配置docker 连接harbor 的用户名密码, 用于docker  从Harbor 镜像仓库中 上传，下载 镜像

Manage Jenkins -> Manage Credentials -> 全局凭据 (unrestricted)  -> Add Credentials 

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-19-3.png)

选择Kind 类型 为 username with passwd

输入账户名，密码

添加一个描述信息



![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-19-6-2.png)

第三步 pipeline中引用示例

```
 steps {
                withCredentials([usernamePassword(credentialsId: "${docker_registry_auth}", passwordVariable: 'password', usernameVariable: 'username')]) {
                sh """
                docker build -t ${image_name} .
                docker login -u ${username} -p '${password}' ${registry}
                docker push ${image_name}
                """
                }
 } 
```



## 4.4 创建kubeconfig 文件，编写deploy.yaml pod模板文件



在上面构建Jenkins-Slave镜像的时候，我们已经在镜像里安装了kubectl 命令，只需要再添加一个kubeconfig 文件去连接K8S 集群，创建标准的 deployment.yaml ,servies.yaml 文件 就可以使用 kubectl apply  XXX.yaml 文件从而生成pod



### 4.4.1 第一步： 授权创建kubeconfig 文件，并保存在jenkins 中



\#准备好创建K8S 集群的那一套 ca证书

```
[root@node1 ssl]# ls ca*

ca-config.json   ca.csr   ca-csr.json   ca-key.pem   ca.pem
```



#创建生成请求证书文件

```
[root@node1 ssl]# vim admin-csr.json
{
"CN": "admin",
"hosts": [],
"key": {
"algo": "rsa",
"size": 2048
},
"names": [
{
"C": "CN",
"L": "BeiJing",
"ST": "BeiJing",
"O": "system:masters",		
"OU": "System"
				}
		]
}

```

注意："O": "system:masters" 指定该证书的 Group 为 system:masters，kubelet 使用该证书访问 kube-apiserver 时 ，由于证书被 CA 签名，所以认证通过，同时由于证书用户组为经过预授权的 system:masters，所以被授予访问所有 API 的权限；



注：这个admin 证书，是将来生成管理员用的kube config 配置文件用的，现在我们一般建议使用RBAC 来对kubernetes 进行角色权限控制， kubernetes 将证书中的CN 字段 作为User， O 字段作为 Group





#生成证书

ps:  安装生成证书的工具

```
[root@node1 ~ ]# curl -L https://pkg.cfssl.org/R1.2/cfssl_linux-amd64 -o /usr/local/bin/cfssl
[root@node1 ~ ]# curl -L https://pkg.cfssl.org/R1.2/cfssljson_linux-amd64 -o /usr/local/bin/cfssljson
[root@node1 ~ ]# curl -L https://pkg.cfssl.org/R1.2/cfssl-certinfo_linux-amd64 -o /usr/local/bin/cfssl-certinfo
[root@node1 ~ ]# chmod +x /usr/local/bin/cfssl*
```



签发证书：

```
[root@node1 ssl]#  cfssl gencert -ca=ca.pem -ca-key=ca-key.pem -config=ca-config.json -profile=kubernetes admin-csr.json | cfssljson -bare admin

2020/07/23 12:06:24 [INFO] generate received request

2020/07/23 12:06:24 [INFO] received CSR

2020/07/23 12:06:24 [INFO] generating key: rsa-2048

2020/07/23 12:06:24 [INFO] encoded CSR

2020/07/23 12:06:24 [INFO] signed certificate with serial number 346834438687956883750356425567391001485757864749

2020/07/23 12:06:24 [WARNING] This certificate lacks a "hosts" field. This makes it unsuitable for

websites. For more information see the Baseline Requirements for the Issuance and Management

of Publicly-Trusted Certificates, v.1.1.6, from the CA/Browser Forum (https://cabforum.org);

specifically, section 10.2.3 ("Information Requirements").
```



查看生成的证书：

```
[root@node1 ssl]#  ls admin*

admin.csr  admin-csr.json  admin-key.pem  admin.pem
```



生成kubeconfig授权文件：

```
[root@node1 ssl]# kubectl config set-cluster kubernetes   --certificate-authority=ca.pem   --embed-certs=true   --server=https://192.168.31.61:6443

#设置用户项中cluster-admin用户证书认证字段
[root@node1 ssl]# kubectl config set-credentials  cluster-admin   --client-key=admin-key.pem   --client-certificate=admin.pem   --embed-certs=true

#设置默认上下文
[root@node1 ssl]#  kubectl config set-context kubernetes   --cluster=kubernetes   --user=cluster-admin

#设置当前环境的default
[root@node1 ssl]#  kubectl config use-context kubernetes
```



查看生成的config文件

```
[root@node1 ssl]#  cat /root/.kube/config 
apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCk1JSUR2akNDQXFhZ0F3SUJBZ0lVVWhMMFhHZ2pLV3FkcVl3cndJUU51UEZZNDlJd0RRWUpLb1pJaHZjTkFRRUwKQlFBd1pURUxNQWtHQTFVRUJoTUNRMDR4RURBT0JnTlZCQWdUQjBKbGFXcHBibWN4RURBT0JnTlZCQWNUQjBKbAphV3BwYm1jeEREQUtCZ05WQkFvVEEyczRjekVQTUEwR0ExVUVDeE1HVTNsemRHVnRNUk13RVFZRFZRUURFd3ByCmRXSmxjbTVsZEdWek1CNFhEVEl4TURNd05URXlOREV3TUZvWERUSTJNRE13TkRFeU5ERXdNRm93WlRFTE1Ba0cKQTFVRUJoTUNRMDR4RURBT0JnTlZCQWdUQjBKbGFXcHBibWN4RURBT0JnTlZCQWNUQjBKbGFXcHBibWN4RERBSwpCZ05WQkFvVEEyczRjekVQTUEwR0ExVUVDeE1HVTNsemRHVnRNUk13RVFZRFZRUURFd3ByZFdKbGNtNWxkR1Z6Ck1JSUJJakFOQmdrcWhraUc5dzBCQVFFRkFBT0NBUThBTUlJQkNnS0NBUUVBNUEvY3RMb2JIMHpuMHpsbXhBUmEKTDhsaDh6ZERsNCtBb1p2RE1pemJjMVpmYm9iUXJpalN6QzQzZ085MnNHTmhUMjVpb2tmakJBZExTYlR3emd4TgpMUTVockUrcXN6bGFXMWtMbTdpRGRGYlBLVTlGbC9VeFhBczRwOFdXZzNpUEYyM0ZNamFsbzh2MGNHTTBieFJoCmNnVlRQZjEyK3c1MGVBRS9RSnNlY3phMElyUzZnUGpVMDRxMG5jT0pENFZsRFJaU3grVUpTZ3M5aTBIZjlvRXAKWWQyTElXUzg2QWExcEg3ODVYS3Q5YkJlWjdReGxKVzN6WVlxMytORTU1eFFQdmxNNkVDbGZWeTJUcnlETTAwZQpkZXZ2eFFHOTVibHhta0c5ak9xWHhVZEN1YWpXbnRqOWZYRGNiMUdOZnF1cWhjaHlRa2dpQ05uMGpiRnVSeDdSCnB3SURBUUFCbzJZd1pEQU9CZ05WSFE4QkFmOEVCQU1DQVFZd0VnWURWUjBUQVFIL0JBZ3dCZ0VCL3dJQkFqQWQKQmdOVkhRNEVGZ1FVSGNBSTQvQm92QWp1dktiOW84UHFjM2JHR0tFd0h3WURWUjBqQkJnd0ZvQVVIY0FJNC9Cbwp2QWp1dktiOW84UHFjM2JHR0tFd0RRWUpLb1pJaHZjTkFRRUxCUUFEZ2dFQkFBbmhRRVQrUnF6NFJpc2lHYm5rCjVPakl3aXh2TzJlQTc2Y3Y5SXl1OVp6TFZ6d29aK0xaWUduVGJTWVVIVzQ3elhrQWxMMUNSTVpwVDVjd3YzTXEKZjVYdFFuT2FnbnllcmFpdytXT3JNQXF2OVlyZ0lqdDhtTXFkU1o2YjhFUm1jblZaQ1BOd241THZHN1B4MkhURApYb1M0cjBIMllrc1RWR0dWZE9LZVdKMlFjVzlwYTFQbDRBZXFpN2xnY2JTUGVzcFJSbkJscXFvelJXb1Jma3VtCmdQSnZhS1VqWEdvNWc0eGYralM3YklITzJCQ0cyQzhDay9tanJkMS8zQzN2UW1wN1ZHTjQvU21ESzFkc0U2RlQKcXlrVHR5TXVOZDBZaXF4Q0JqNzZXbXpLZTJubXh3ZkhHOUZXK2gwMkI2MG8zSGVXRlFCRG54TUhDTEFVTjJKago1NzA9Ci0tLS0tRU5EIENFUlRJRklDQVRFLS0tLS0K
    server: https://192.168.31.61:6443
  name: kubernetes
contexts:
- context:
    cluster: kubernetes
    user: cluster-admin
  name: kubernetes
current-context: kubernetes
kind: Config
preferences: {}
users:
- name: cluster-admin
  user:
    client-certificate-data: LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCk1JSUQzVENDQXNXZ0F3SUJBZ0lVVEl4cU96NUhWNnNUNHpxZXdIb1ljODVZOFowd0RRWUpLb1pJaHZjTkFRRUwKQlFBd1pURUxNQWtHQTFVRUJoTUNRMDR4RURBTgvdfgfsKbGFXcHBibWN4RURBT0JnTlZCQWNUQjBKbAphV3BwYm1jeEREQUtCZ05WQkFvVEEyczRjekVQTUEwR0ExVUVDeE1HVTNsemRHVnRNUk13RVFZRFZRUURFd3ByCmRXSmxjbTVsZEdWek1CNFhEVEl4TURNeU16QXhNakV3TUZvWERUTXhNRE15TVRBeE1qRXdNRm93YXpFTE1Ba0cKQTFVRUJoTUNRMDR4RURBT0JnTlZCQWdUQjBKbGFVcHBibWN4RURBT0JnTlZCQWNUQjBKbGFVcHBibWN4RnpBVgpCZ05WQkFvVERuTjVjM1JsYlRwdFlYTjBaWEp6TVE4d0RRWURWUVFMRXdaVGVYTjBaVzB4RGpBTUJnTlZCQU1UCkJXRmtiV2x1TUlJQklqQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FROEFNSUlCQ2dLQ0FRRUF4RWVKbjc0fdsgfsdd1pQTSsya3lIOSt3dUFmS2R1K2U5VTg2cjg3YWZoK2hZYnUrM2gzOVlBUk56N1RNMSt5Mzh6MCt6bAp3bXEzMGNRYU9lR1lRNTB4eFZFWnpIZDhqSE5lWjY2eEsrVmpmd1BhUHhUNkQ0NS90VGJBeE8yY0gfdsgsdfvcjA0ODFKRmR5OXRzbW5ic3BWWnRVNlV3bVJlUXNwVlRud1RDeTNFRjIzL2ZDbEFZaFZSMUMKcHZidzFtL3dIV0ZGT3lieVB0dkhERC96K2l3dUNsRmQzQ1RWTnB2QTkxRm05b0FFVkUvNWpzRXQxVjAzUCttSgpJTkZvbE5kc3dBaHNNa1MzNjNTbHFndXB3bmhQemVwVUFoTWVuenkxeXZlakR1elRoS1VscThyUi83cWg4OFRDCjQvZm1McW5MZ3dJREFRQUJvMzh3ZlRBT0JnTlZIUThCQWY4RUJBTUNCYUF3SFFZRFZSMGxCQll3RkFZSUt3WUIKQlFVvfs0FDT1B3YUx3STdyeW0vYVBENm5OMnhoaWhNQTBHCkNTcUdTSWIzRFerrrcjViTHFkM0FCU3Iwa29LMGFScWxTRQptR0Iyb2xKMkV5Qlhmc20wNUR4d2VRUGY3Z3A3aDMzbHRLcVVHQ0tId2ZBQXR2R1NYNnFLK0VzaHRYT3ZBa3p5ClZzZHY1TjZPV3ZManI5ZHRVSzV1b08zZlRKb0RPVVk2bnYrZElOOVVyNlpFRmlQbmVHWWE4bUV2MHhYcnpVZTMKRFRST0oxN1JtQlRISWpsQmZaQjdnNExmbVVnUmk3NERMZWtzcFhkS3ZrZ2lyZzR3dVJ6cSswb2h6ZWxZTUY3Rgp3U09ya1QzcVVObmlRZmRnTUxtSXA5Wk4rT0srdGFBaVYwN0d6ZTd1WGdiVAotLS0tLUVORCBDRVJUSUZJQ0FURS0tLS0tCg==
    client-key-data: LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQpNSUlFcEFJQkFBS0NBUUVBeEVlSm43NHc2WXdWZWtrT1B3d1pQTSsya3lIOSt3dUFmS2R1K2U5VTg2cjg3YWZoCitoWWJ1KzNoMzlZQVJOejdUTTEreTM4ejAremx3bXEzMGNRYU9lR1lRNTB4eFZFWnpIZDhqSE5lWjY2eEsrVmoKZndQYVB4VDZENDUvdFRiQXhPMmNOYVRuRUVvWlRyQ2s2ck9nOUxFcjA0ODFKRmR5OXRzbW5ic3BWWnRVNlV3bQpSZVFzcFZUbndUQ3kzRUYyMy9mQ2xBWWhWUjFDcHZidzFtL3dIV0ZGT3lieVB0dkhERC96K2l3dUNsRmQzQ1RWCk5wdkE5MUZtOW9BRVZFLzVqc0V0MVYwM1ArbUpJTkZvbE5kc3dBaHNNa1MzNjNTbHFndXB3bmhQemVwVUFoTWUKbnp5MXl2ZWpEdXpUaEtVbHE4clIvN3FoODhUQzQvZm1McW5MZ3dJREFRQUJBb0lCQUNtWXc1amdGTHVhSFg4aAo5bXYwSTNFWTBDZVVYNkFSaXZSZ0E0dmgfdgdfgdfgvp4T1NGZVNaQUhLUWh0UVJSUXk4ekM5U1VPaUwzeEY1CnptVWRPeldqRXNMWmtJK3hwVmNJeDVONGE3eHJjRTdPT1d6VW95OFZRZjJFQkpxaDlPNkhNTURKcHRKejhiTVUKaW83VzdMaU94NnY1UUpqb0U0d3ZXNXEzN0lXZ202bkVjSitKSnJhaHJlZHM2Q0dQWmVYRExnRXRUTFVJTWRqQwpoTWdXeTNMQy9vUm1oZ2tOZndsTjc0YmlwaVY3SklNelRlYm9nQmlTUE10d3liVDgwUWFVMDBwVEdKYlpod29YCmp3OUVtcWN3MlB2ZTVYM0pCcDdlSEtoTHQxZDArb09GUDZVUFZjZVBMNk1YSDVkckxTcU9Cdmd3U2U3cDlvUGwKLzZrZXZMa0NnWUVBNTJqNWpLTU1rM3lYK292N3p1dGg1ZFR1a3BMYm5RQ2M5QnlReFFXa0RMOHdOSEc1SE1jegpiZnh3SkI4UTZ5QUs2dVpYeTk3elNlSy85K2VNNSsyRFQ5L0xPdHhxRkZRbG80K1V2ZXlycFBWZG5hYkRxSU5MCldpc2NhY1l1Q3dPZzFBei9QTTBTQXk2RzZCWE9EVk0za2E2QllyUHp1TDQwenpTSitYQTZPSGNDZ1lFQTJTTG8KZXhPWUR5Q0NtU3pTMTFNdDFwVmlTcGhiWWNPbHB1ZGMxYXdmOXVDRDMrOWwzUDdUdDJaUUhvSUZxSjZrMjJ6eQpvclcreVRyVGxEa1MraFhwTFRsbnRuNnFiS0dGQW1JaDhBbWdYUVVNMHY0QlNLNDJGRUh1R1BVdjNOQWJEVmJBCm4xVGl4NUh2VVJPNHh6Y2IvT2lRM2ZBOVdoQlFQbFk2YW5jaVZGVUNnWUE2RG5JZFFJTFZOYnNEVnI5VUNHWEYKUFlpbEtVY0R1cldsNE16SlFVTUpGNlpHWWdtcEdLamtmU0s5VFRYM1oxQ1Y0amhBbzZ5eDZydHl2SnJ6VFBsVwp2clRFRGF4bmNUMElMZXVKUXFsRmQzR0hMZUdFazN3Q0lUSzlyc1M2YXF5Y3hxMzZXUkNkejd4MDJaT2FjRGhPCnlsTVhxa0lKSlY4bVpPNEFzSkZLdlFLQmdRQ3BWeDhtTlY3R2xWMGs1cDg4VE9PWDBZTUptQTdValFmWXhlRlIKeHQ1YTVEZ1U0aGg0Sk1pcTVJRWhlZGU5N0pPM2lSMGxwa1kzbThnOGRkS0Y5YWFYblloei9BOGZqMHd6VXFNVApGLzdYN01OV25jQVVsY0VaUlYzU1d3M0wwUVQzL3l0VVY1aFJlay9BMUhlcjdoL0d1djJZQ085Z0dRN3J2c1hxCkdDVk96UUtCZ1FEY3ZzS1pwT3UrcWdTK2V0UXdXdXlDbXFTNFE4ZXkybGN1emVZK2Z1Sk9DK3lLN3kzYSt5RUMKLzk2OHBtMDlGNVQ4SjJKeWFzSjh2TFUxdTh3VnJUeWhscktFL21wQjRKZWd2RDVYMW9Mb0ZaLzVKbVlSeDJKVQpKOTgwcVVvcHc4MTF6Z3Baamh3MzRyMEhqMzZNemozQVRSaTkyRmpPU1VTWWtVVHpORGpyVmc9PQotLS0tLUVORCBSU0EgUFJJVkFURSBLRVktLS0tLQo=
```



使用--kubeconfig= 指定生成的config文件路径，测试连接K8S集群

```
[root@node1 ssl]# kubectl --kubeconfig=/root/.kube/config get nodes
NAME STATUS ROLES AGE VERSION
node1 Ready <none> 19d v1.16.0
node2 Ready <none> 19d v1.16.0
node3 Ready <none> 9d v1.16.0
```



### 4.4.2  第二步：把生成的kubeconfig配置文件存放在jenkins 中

存储kubectl用于连接k8s集群的kubeconfig配置文件,需要安装 Config File Provider 这个插件, 上面在部署jenkins 环境初始化的时候，已经安装好了该插件

Manage Jenkins  ->   Managed files    ->   Add a new Config   ->   Custom file（自定义文件）

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-19-11.png)





![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-19-12.png)选择类型 为 Custom file（自定义文件）

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-19-13.png)



输入 Name：  k8s-kubeconfig

把生成的kubeconfig 文件内容 复制到 Content 文本框中



![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-19-14.png)



可以在Managed files 中看到这一个配置文件

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-19-15.png)

### 4.4.3 第三步：把Managed files 中的配置文件 转换成pipeline 语法



同样适用 jenkins 官方提供一个pipeline 语法的生成器

任意创建一个流水线项目

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-13.png)



在pipeline 选项那里点击 ， pipeline Syntax

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-19-5.png)

点击片段生成器，Sample Step 下拉选项框中 选择 configFileProvider: Provide Configuration files 

在File  下拉选项框中，选中 刚刚创建的 自定义文件  k8s-kubeconfig

在Target 中 输入 admin.kubeconfig  (target 表示把 自定义的文件 挂载到 jenkin-slave 镜像的什么路径下，这边定义了文件名称，就相当于把 admin.kubeconfig  文件 放在  jenkin-slave 镜像 的默认工作路径下/home/jenkins/agent/workspace/XX  下面 )



最后点击 Generate Pipeline Script 生产pipeline 语法

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-19-16.png)



 pipeline 生成的示例如下：

```
configFileProvider([configFile(fileId: '15ce8016-40d1-4b91-867d-e2c4c947741f', targetLocation: 'admin.kubeconfig')]) {
}
```



### 4.4.4 第四步：编写标准的deploy.yaml 模板

本项目是 使用Jenkins在Kubernetes中持续部署一个无状态的tomcat pod 应用；涉及到 deployment 控制器 以及采用NodePort 的方式去 访问pod 



deployment.yaml 和 service.yaml 我把他合并在一个deploy.yaml 文件中

另外deploy.yaml 文件 必须和 项目的代码 在同一个路径下（否则kubectl 无法指定yaml 文件就 无法创建pod）

deploy.yaml  文件在 https://github.com/fxkjnj/kubernetes/tree/main/jenkins-for_kubernetes/app 目录下

```
[root@master-1 app]# cat > deploy.yaml << EOF

apiVersion: apps/v1
kind: Deployment
metadata:
  name: java-demo
spec:
  replicas: REPLICAS
  selector:
    matchLabels:
      project: www
      app: java-demo
  template:
    metadata:
      labels:
        project: www
        app: java-demo
    spec:
      imagePullSecrets:
      - name: SECRET_NAME
      containers:
      - image: IMAGE_NAME
        name: java-demo
        resources:
          requests:
            cpu: 0.5
            memory: 500Mi
          limits: 
            cpu: 1
            memory: 1Gi
        livenessProbe:
          httpGet:
            path: /
            port: 8080
          initialDelaySeconds: 50
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /
            port: 8080
          initialDelaySeconds: 50
          periodSeconds: 10


---
apiVersion: v1
kind: Service
metadata:
  name: java-demo 
spec:
  selector:
    project: www
    app: java-demo
  type: NodePort
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8080
EOF
```



## 4.5  其他

### 4.5.1 在K8S 集群中创建sercret 用于连接Harbor仓库（用于K8S创建POD时 拉取镜像）

备注： 

应用启动过程中可能需要一些敏感信息，比如访问数据库的用户名密码或者秘钥。将这些信息直接保存在容器镜像中显然不妥，Kubernetes 提供的解决方案是 Secret。

Secret 会以密文的方式存储数据，避免了直接在配置文件中保存敏感信息。Secret 会以 Volume 的形式被 mount 到 Pod，容器可通过文件的方式使用 Secret 中的敏感数据；此外，容器也可以环境变量的方式使用这些数据。





找一台登陆过的Harbor 的 node 的节点，查看 cat ~/.docker/config.json 问价里的内容

```
[root@node-1 ~]# cat ~/.docker/config.json
{
	"auths": {
		"192.168.31.100": {
			"auth": "YWRtaW46SGFyYm9yMTIzNDU="
		}
	},
	"HttpHeaders": {
		"User-Agent": "Docker-Client/19.03.9 (linux)"
	}
```

使用 base64  对  ~/.docker/config.json 文件 进行编码

```
[root@node-1 ~]# cat ~/.docker/config.json | base64
ewoJImF1dGhzIjogewoJCSIxOTIuMTY4LjMxLjEwMCI6IHsKCQkJImF1dGgiOiAiWVdSdGFXNDZT
R0Z5WW05eU1USXpORFU9IggfX0KCXgfgfdiSHR0cEhlYWRlcnMiOiB7CgkJIlVzZXItQWdlbnQi
OiAiRG9ja2VyLUNsaWVudC8xOS4wMy45IChsaW51eCkiCgl9Cn0=
```



创建secret yaml文件  

```
 #注意base64 的结果要写成一行
[root@manager ~]# vim registry-pull-secret.yaml   
apiVersion: v1
kind: Secret
metadata:
  name: registry-pull-secret
data:
.dockerconfigjson:ewoJImF1dGhzIjogewoJCSIxOTIuMTY4LjMxLjEwMCI6IHsKCQkJImF1dGgiOiAiWVdSdGFXNDZTR0Z5WW05eU1USXpORFU9IggfX0KCXgfgfdiSHR0cEhlYWRlcnMiOiB7CgkJIlVzZXItQWdlbnQiOiAiRG9ja2VyLUNsaWVudC8xOS4wMy45IChsaW51eCkiCgl9Cn0=
type: kubernetes.io/dockerconfigjson
```



在 指定的 ns 命名空间下 执行 kubectl apply 创建 Secret：

```
[root@master-1 .docker]# for i in {prod,dev}
> do
> kubectl  apply -f registry-pull-secret.yaml -n ${i}
> done
secret/registry-pull-secret created
secret/registry-pull-secret created

```



\# 查看存在的 secret

```
[root@manager ~]# kubectl get secret -n prod

NAME                   TYPE                                  DATA   AGE

registry-pull-secret   kubernetes.io/dockerconfigjson        1      77s


[root@manager ~]# kubectl get secret -n dev

NAME                   TYPE                                  DATA   AGE

registry-pull-secret   kubernetes.io/dockerconfigjson        1      77s
```



### 4.5.2定义环境变量，使用参数化构建，修改deploy.yaml文件

需要提前定义好的环境变量：

```
//定义harbor的地址
def registry = "192.168.31.100"

// 项目，BUILD_NUMBER jenkins 内置变量，jenkins 构建编号
def project = "fxkj"
def app_name = "app"
def image_name = "${registry}/${project}/${app_name}:${BUILD_NUMBER}"
def git_address = "http://192.168.31.200/fxkj/app.git"

// 认证
//k8s 连接harbor 证书
def secret_name = "registry-pull-secret"

//jenkins中定义docker连接harbor的用户密码凭证
def docker_registry_auth = "fe46d806-6a47-42bd-88ea-24403d97afb5"

//jenkins中定义git连接gitlab的用户密码凭证
def git_auth = "bcf76dc6-d1d0-4611-a50c-e462eede257a"

//jenkins中Config File Provider插件 定义的kubeconfig 文件内容
def k8s_auth = "15ce8016-40d1-4b91-867d-e2c4c947741f"

```



 参数化构建过程中，需要交互的内容：

	发布分支(prod,dev)
	副本数（1,3,5,7）
	命名空间（prod,dev）


一个标准的deploy.yaml模板文件，需要把修改的内容：

```
#修改deploy.yaml 中镜像名称
sed -i 's#IMAGE_NAME#${image_name}#' deploy.yaml

#修改deploy.yaml 中k8s连接harbor连接的secret
sed -i 's#SECRET_NAME#${secret_name}#' deploy.yaml

#修改deploy.yaml 中副本的数量
sed -i 's#REPLICAS#${ReplicaCount}#' deploy.yaml

#指定pod 创建在哪个命名空间下
kubectl apply -f deploy.yaml -n ${Namespace} --kubeconfig=admin.kubeconfig  
```





pipeline中引用示例：

```
//参数化构建
parameters {    
        gitParameter branch: '', branchFilter: '.*', defaultValue: 'master', description: '选择发布的分支', name: 'Branch', quickFilterEnabled: false, selectedValue: 'NONE', sortMode: 'NONE', tagFilter: '*', type: 'PT_BRANCH'
        choice (choices: ['1', '3', '5', '7'], description: '副本数', name: 'ReplicaCount')
        choice (choices: ['prod','dev'], description: '命名空间', name: 'Namespace')
    }
    

//部署pod需要修改的内容
sh """
sed -i 's#IMAGE_NAME#${image_name}#' deploy.yaml
sed -i 's#SECRET_NAME#${secret_name}#' deploy.yaml
sed -i 's#REPLICAS#${ReplicaCount}#' deploy.yaml
kubectl apply -f deploy.yaml -n ${Namespace} --kubeconfig=admin.kubeconfig  
"""
```

### 

## 4.6 完整的pipeline 流水线 脚本

```
// 公共
def registry = "192.168.31.100"
// 项目，BUILD_NUMBER jenkins 内置变量，jenkins 构建编号
def project = "fxkj"
def app_name = "app"
def image_name = "${registry}/${project}/${app_name}:${BUILD_NUMBER}"
def git_address = "http://192.168.31.200/fxkj/app.git"
// 认证
//k8s 连接harbor 证书
def secret_name = "registry-pull-secret"

//jenkins中定义docker连接harbor的用户密码凭证
def docker_registry_auth = "fe46d806-6a47-42bd-88ea-24403d97afb5"

//jenkins中定义git连接gitlab的用户密码凭证
def git_auth = "bcf76dc6-d1d0-4611-a50c-e462eede257a"

//jenkins中Config File Provider插件 定义的kubeconfig 文件内容
def k8s_auth = "15ce8016-40d1-4b91-867d-e2c4c947741f"

pipeline {
    agent {
        kubernetes {
            yaml '''
apiVersion: v1          
kind: Pod
metadata:
  name: jenkins-slave
spec:
  containers:
  - name: jnlp
    image: 192.168.31.100/library/jenkins-slave-jdk:1.8
    imagePullPolicy: Always
    volumeMounts:
      - name: docker-cmd
        mountPath: /usr/bin/docker
      - name: docker-sock
        mountPath: /var/run/docker.sock
      - name: maven-cache
        mountPath: /root/.m2

  volumes:
    - name: docker-cmd
      hostPath:
        path: /usr/bin/docker
    - name: docker-sock
      hostPath:
        path: /var/run/docker.sock
    - name: maven-cache
      persistentVolumeClaim:
        claimName: mavencache
'''
           
        }
    }
	 parameters {    
        gitParameter branch: '', branchFilter: '.*', defaultValue: 'master', description: '选择发布的分支', name: 'Branch', quickFilterEnabled: false, selectedValue: 'NONE', sortMode: 'NONE', tagFilter: '*', type: 'PT_BRANCH'
        choice (choices: ['1', '3', '5', '7'], description: '副本数', name: 'ReplicaCount')
        choice (choices: ['prod','dev'], description: '命名空间', name: 'Namespace')
    }

    stages {		
		stage('拉取代码'){
            steps {
                checkout([$class: 'GitSCM', 
                branches: [[name: "${params.Branch}"]], 
                doGenerateSubmoduleConfigurations: false, 
                extensions: [], submoduleCfg: [], 
                userRemoteConfigs: [[credentialsId: "${git_auth}", url: "${git_address}"]]
                ])
            }
        }
		
        stage('代码编译') {
            steps {
                sh 'mvn clean package -Dmaven.skip.test=true'
                sh 'ls -l target/'
                sh 'pwd'
            }
        }
        stage('构建镜像并推送仓库') {
             steps {
                withCredentials([usernamePassword(credentialsId: "${docker_registry_auth}", passwordVariable: 'password', usernameVariable: 'username')]) {
                sh """
                docker build -t ${image_name} .
                docker login -u ${username} -p '${password}' ${registry}
                docker push ${image_name}
                """
                }
           } 
			
        }
        stage('部署到K8S平台'){
             steps {
              configFileProvider([configFile(fileId: "${k8s_auth}", targetLocation: "admin.kubeconfig")]){
                sh """
                  sed -i 's#IMAGE_NAME#${image_name}#' deploy.yaml
                  sed -i 's#SECRET_NAME#${secret_name}#' deploy.yaml
                  sed -i 's#REPLICAS#${ReplicaCount}#' deploy.yaml
                  kubectl apply -f deploy.yaml -n ${Namespace} --kubeconfig=admin.kubeconfig
                  sleep 120
                  kubectl get pods,svc -n ${Namespace} --kubeconfig=admin.kubeconfig
                """
              }
          }
        }
    }
}
```



jenkins 流水线构建截图：

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-20.png)





![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-21.png)



项目截图 ：

![](http://jpg.fxkjnj.com/soft/jenkins/jenkins-k8s-22.png)



