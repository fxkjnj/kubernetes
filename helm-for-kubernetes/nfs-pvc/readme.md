### 1、部署NFS 服务

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



### 2、集群所有节点都要安装nfs-utils

```
yum -y install nfs-utils

#记住，所有节点都要安装nfs-utils，否则无法使用pv
```



### 3、部署动态PV



##### 	3.1、创建NFS  动态PV专属命名空间

```
[root@master-1 ~]# kubectl create ns nfs
namespace/nfs created
```

#####    

##### 	3.2、使用Helm 部署nfs-client-provisioner

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

##### 3.3、查看 nfs-client-provisioner Pod 运行状态

```
[root@master-1 es-single-node]# kubectl get pods -n nfs
NAME                                                          READY   STATUS    RESTARTS   AGE
elastic-nfs-storage-nfs-client-provisioner-78c7754777-8kvlg   1/1     Running   0          28m
elastic-nfs-storage-nfs-client-provisioner-78c7754777-vtpn8   1/1     Running   0          28m
elastic-nfs-storage-nfs-client-provisioner-78c7754777-zbx8s   1/1     Running   0          28m

```
