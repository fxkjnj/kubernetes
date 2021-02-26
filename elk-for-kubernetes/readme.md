ELK Stack日志系统收集K8s中日志



## 一、日志收集的需求背景：



​			• 业务发展越来越庞大，服务器越来越多

​			• 各种访问日志、应用日志、错误日志量越来越多

​			• 开发人员排查问题，需要到服务器上查日志，效率低、权限不好控制

​			• 运维需实时关注业务访问情况





## 二、容器特性给日志采集带来的难度：



​			• K8s弹性伸缩性：导致不能预先确定采集的目标
​			• 容器隔离性：容器的文件系统与宿主机是隔离，导致日志采集器读取日志文件受阻





## 三、应用程序日志记录分为两类：



​			• 标准输出：输出到控制台，使用kubectl logs可以看到 (比如nginx 的日志就是输出到控制台)

​			• 日志文件：写到容器的文件系统的文件(比如tomcat的日志就是写入到容器中的文件系统的文件)






## 四、Kubernetes应用日志收集

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-1.png)



针对标准输出：以DaemonSet方式在每个Node上部署一个日志收集程序，采集/var/lib/docker/containers/目录下所有容器日志



针对容器中日志文件：在Pod中增加一个容器运行日志采集器，使用emtyDir共享日志目录让日志采集器读取到日志文件





## 五、ELK Stack日志系统

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-2.png)
<hr1>

EFK 是三个开源软件的缩写，提供一套完整的企业级日  志平台解决方案。
分别是：

    • Elasticsearch：搜索、分析和存储数据
    
    • Filebeat ：是本地文件的日志数据采集器,可监控日志目录或特定日志文件,并将它们转发给Elasticsearch或Logstatsh进行索引、kafka等
    
    • Kibana：数据可视化



## 六、部署ES 单点+ filebeat + kibana 实现Kubernetes应用日志收集 



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



##### 	5.1、创建NFS  专属命名空间

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
[root@master-1 es-single-node]# helm install elastic-nfs-storage -n nfs --values elastic-client.yaml helm-stable/nfs-client-provisioner --version 1.2.8
```

##### 5.3、查看 nfs-client-provisioner Pod 运行状态

```
[root@master-1 es-single-node]# kubectl get pods -n nfs
NAME                                                          READY   STATUS    RESTARTS   AGE
elastic-nfs-storage-nfs-client-provisioner-78c7754777-8kvlg   1/1     Running   0          28m
elastic-nfs-storage-nfs-client-provisioner-78c7754777-vtpn8   1/1     Running   0          28m
elastic-nfs-storage-nfs-client-provisioner-78c7754777-zbx8s   1/1     Running   0          28m

```



### 6、部署单节点Elasticsearch



### 7、部署Filebeat



### 8、收集容器标准输出日志



### 9、收集容器日志文件



















## 七、Helm 部署 EFK 集群实现Kubernetes应用日志收集 





































第一步：搭建日志系统：

    • elasticsearch.yaml # ES数据库
    • kibana.yaml # 可视化展示


<hr1>
第二步：标准输出容器日志收集：

    • filebeat-kubernetes.yaml 	# 采集所有容器标准输出
    • app-log-stdout.yaml 			# 标准输出的项目案例(nginx)

<hr1>
第三步：容器中日志文件收集：

    • app-log-logfile.yaml 			# 日志文件的项目案例（nginx-php,这里的nginx 日志不会输入出到控制台，而是直接入到/usr/local/nginx/logs 日志中）



### Kibana登陆后界面：



![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-4.png)





### 索引管理：

（一般只要有数据入到ES中就会有索引出现 ，如果没有出现可以试着访问下业务使其产生日志输出到ES中）

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-6.png)



### 添加索引模式：



![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-7.png)



### 数据查询界面：

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-5.png)
