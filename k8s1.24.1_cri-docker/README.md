# kubeadm极速部署Kubernetes 1.24版本集群

# 一、Kubernetes 1.24版本发布及改动

## 1.1 Kubernetes 1.24 发布

2022 年 5 月 3 日，Kubernetes 1.24 正式发布，在新版本中，我们看到 Kubernetes 作为容器编排的事实标准，正愈发变得成熟，**有 12 项功能都更新到了稳定版本**，同时引入了很多实用的功能，例如 **StatefulSets 支持批量滚动更新**，**NetworkPolicy 新增 NetworkPolicyStatus 字段方便进行故障排查等**





## 1.2 Kubernetes 1.24 改动

Kubernetes 正式移除对 Dockershim 的支持，讨论很久的 “弃用 Dockershim” 也终于在这个版本画上了句号。

想要清楚的了解docker 和 k8s 的关系，可以参考下这篇文章：  https://i4t.com/5435.html



**Kubernetes1.24 之前：**

![image-20220508094844868](http://jpg.fxkjnj.com/picgo/202206010947180.png)



**Kubernetes1.24 之后：**

如还想继续在k8s中使用docker，需要自行安装cri-dockerd 组件； 不然就使用containerd 



![image-20220508094933949](http://jpg.fxkjnj.com/picgo/202206010947754.png)



![image-20220507134711296](http://jpg.fxkjnj.com/picgo/202206010947241.png)







# 二、Kubernetes 1.24版本集群部署

## 2.1 Kubernetes 1.24版本集群部署环境准备

### 2.1.1 主机操作系统说明

| 序号 |        操作系统及版本         | 备注 |
| :--: | :---------------------------: | :--: |
|  1   | CentOS Linux release 7.9.2009 |      |



### 2.1.2 主机硬件配置说明

| CPU  | 内存 | 硬盘  | 角色   | IP地址        | 主机名       |
| ---- | ---- | ----- | ------ | ------------- | ------------ |
| 4C   | 8G   | 100GB | master | 172.16.200.30 | k8s-master01 |
| 4C   | 8G   | 100GB | node   | 172.16.200.31 | k8s-node1    |
| 4C   | 8G   | 100GB | node   | 172.16.200.32 | k8s-node2    |

### 2.1.3 主机配置

#### 2.1.3.1  主机名配置

由于本次使用3台主机完成kubernetes集群部署，其中1台为master节点,名称为k8s-master01;其中2台为node节点，名称分别为：k8s-node1及k8s-node2





```
master节点
# hostnamectl set-hostname k8s-master01
```



```
node1节点
# hostnamectl set-hostname k8s-node1
```



```
node2节点
# hostnamectl set-hostname k8s-node2
```



#### 2.1.3.2 主机名与IP地址解析



> 所有集群主机均需要进行配置。



```
cat >> /etc/hosts <<EOF
127.0.0.1   localhost localhost.localdomain localhost4 localhost4.localdomain4
::1         localhost localhost.localdomain localhost6 localhost6.localdomain6
172.16.200.30 k8s-master01
172.16.201.31 k8s-node1
172.16.201.32 k8s-node2
EOF

```


#### 2.1.3.3 关闭SWAP分区



> 修改完成后需要重启操作系统，如不重启，可临时关闭，命令为swapoff -a



```
#临时关闭
# swapoff -a


#永远关闭swap分区，需要重启操作系统
sed -i '/ swap / s/^\(.*\)$/#\1/g' /etc/fstab
```




#### 2.1.3.4  防火墙配置



> 所有主机均需要操作。



```
关闭现有防火墙firewalld
# systemctl disable firewalld
# systemctl stop firewalld
# firewall-cmd --state
not running
```



#### 2.1.3.5 SELINUX配置



> 所有主机均需要操作。修改SELinux配置需要重启操作系统。



```
#临时关闭
#setenforce 0

#永久生效
# sed -ri 's/SELINUX=enforcing/SELINUX=disabled/' /etc/selinux/config

```



#### 2.1.3.6 时间同步配置



>所有主机均需要操作。最小化安装系统需要安装ntpdate软件。



```
# crontab -l
0 */1 * * * /usr/sbin/ntpdate time1.aliyun.com


#设置上海时区，东八区
# timedatectl set-timezone Asia/Shanghai
```





#### 2.1.3.7 升级操作系统内核

> 所有主机均需要操作。



```
导入elrepo gpg key
$ rpm --import https://www.elrepo.org/RPM-GPG-KEY-elrepo.org
```



```
安装elrepo YUM源仓库
$ yum -y install https://www.elrepo.org/elrepo-release-7.0-4.el7.elrepo.noarch.rpm
```



```
安装kernel-ml版本，ml为长期稳定版本，lt为长期维护版本
$ yum --enablerepo="elrepo-kernel" -y install kernel-ml.x86_64
```



```
设置grub2默认引导为0
$ grub2-set-default 0
```



```
重新生成grub2引导文件
$ grub2-mkconfig -o /boot/grub2/grub.cfg
```



```
更新后，需要重启，使用升级的内核生效。
$ reboot
```



```
重启后，需要验证内核是否为更新对应的版本
$ uname -r
```



#### 2.1.3.8  配置内核转发及网桥过滤

>所有主机均需要操作。



```
添加网桥过滤及内核转发配置文件

cat <<EOF >/etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
net.ipv4.ip_forward = 1
vm.swappiness=0
EOF
```



```
#使之生效
$ sysctl -p /etc/sysctl.d/k8s.conf 
```



```
#加载br_netfilter模块
# modprobe br_netfilter
```



```
#查看是否加载
# lsmod | grep br_netfilter
br_netfilter           22256  0
```





#### 2.1.3.9 安装ipset及ipvsadm

> 所有主机均需要操作。



```
安装ipset及ipvsadm
$ yum -y install ipset ipvsadm
```



```
#配置ipvsadm模块加载方式.添加需要加载的模块

cat > /etc/sysconfig/modules/ipvs.module <<EOF
modprobe -- ip_vs
modprobe -- ip_vs_sh
modprobe -- ip_vs_rr
modprobe -- ip_vs_wrr
modprobe -- nf_conntrack
EOF
```



```
授权、运行、检查是否加载
chmod 755 /etc/sysconfig/modules/ipvs.module &&  /etc/sysconfig/modules/ipvs.module
```





## 2.2  Docker准备

### 2.2.1 Docker安装环境准备

>准备一块单独的磁盘，建议单独把/var/lib/docker 挂载在一个单独的磁盘上  ，所有主机均需要操作。

```
#格式化磁盘
$ mkfs.ext4 /dev/sdb

#创建docker工作目录
$ mkdir /var/lib/docker

#写入挂载信息到fstab中，永久挂载
$ echo "/dev/sdb /var/lib/docker ext4 defaults 0 0" >>  /etc/fstab

#使fstab挂载生效
$ mount -a

#查看磁盘挂载
$ df -h /dev/sdb


# 安装一些必要工具
$ yum install -y yum-utils device-mapper-persistent-data lvm2

```









### 2.2.2 Docker安装YUM源准备

>使用阿里云开源软件镜像站。



```
$ wget https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo -O /etc/yum.repos.d/docker-ce.repo
```



### 2.2.2 Docker安装



```
## 查看所有的可用版本
$ yum list docker-ce --showduplicates | sort -r

#安装旧版本 yum install docker-ce-cli-19.03.15-3.el7  docker-ce-19.03.15-3.el7

# 安装源里最新版本
$ yum install docker-ce
```



### 2.2.3 启动Docker服务



```
$  systemctl enable --now docker
$  systemctl start docker
```



### 2.2.4 配置docker加速，修改cgroup方式

>/etc/docker/daemon.json 默认没有此文件，需要单独创建

```
在/etc/docker/daemon.json添加如下内容

tee /etc/docker/daemon.json <<-'EOF'
{                     
  "registry-mirrors" : [
    "http://hub-mirror.c.163.com"],
    "exec-opts": ["native.cgroupdriver=systemd"]
}
EOF
```



```
# 启动docker
    $ systemctl enable docker && systemctl restart docker
```



### 2.2.5 cri-dockerd安装



#### 2.2.5.1 下载cri-dockerd 二进制文件

**项目地址：**  https://github.com/Mirantis/cri-dockerd



![image-20220601112053221](http://jpg.fxkjnj.com/picgo/202206011120348.png)



![image-20220601114203066](http://jpg.fxkjnj.com/picgo/202206011142179.png)

**下载cri-dockerd-0.2.1.amd64.tgz 二进制版本**

![image-20220601114242982](http://jpg.fxkjnj.com/picgo/202206011142095.png)



> 所有节点 都安装  cri-dockerd

```
# 拷贝二进制文件

# tar -xf cri-dockerd-0.2.1.amd64.tgz 
# cp cri-dockerd/cri-dockerd /usr/bin/
# chmod +x /usr/bin/cri-dockerd 


```



```

# 配置启动文件

cat <<"EOF" > /usr/lib/systemd/system/cri-docker.service
[Unit]
Description=CRI Interface for Docker Application Container Engine
Documentation=https://docs.mirantis.com
After=network-online.target firewalld.service docker.service
Wants=network-online.target
Requires=cri-docker.socket

[Service]
Type=notify

ExecStart=/usr/bin/cri-dockerd --network-plugin=cni --pod-infra-container-image=registry.aliyuncs.com/google_containers/pause:3.7

ExecReload=/bin/kill -s HUP $MAINPID
TimeoutSec=0
RestartSec=2
Restart=always

StartLimitBurst=3

StartLimitInterval=60s

LimitNOFILE=infinity
LimitNPROC=infinity
LimitCORE=infinity

TasksMax=infinity
Delegate=yes
KillMode=process

[Install]
WantedBy=multi-user.target

EOF





# 生成socket 文件

cat <<"EOF" > /usr/lib/systemd/system/cri-docker.socket
[Unit]
Description=CRI Docker Socket for the API
PartOf=cri-docker.service

[Socket]
ListenStream=%t/cri-dockerd.sock
SocketMode=0660
SocketUser=root
SocketGroup=docker

[Install]
WantedBy=sockets.target

EOF

```

【也可以直接下载https://github.com/Mirantis/cri-dockerd/tree/master/packaging/systemd 注意，需要修改cri-docker.service 中 ExecStart 启动参数，这里/usr/bin/cri-dockerd一定要加上参数--pod-infra-container-image=registry.aliyuncs.com/google_containers/pause:3.7用来指定所用的pause镜像是哪个，否则默认拉取k8s.gcr.io/pause:3.6，会导致安装失败。



#### 2.2.5.2 启动cri-docker

```
systemctl daemon-reload
systemctl start cri-docker
systemctl enable cri-docker
systemctl status cri-docker
```







## 2.3 kubernetes 1.24.1  集群部署

### 2.3.1  集群软件及版本说明

|          | kubeadm                | kubelet                                       | kubectl                |
| -------- | ---------------------- | --------------------------------------------- | ---------------------- |
| 版本     | 1.24.1                 | 1.24.1                                        | 1.24.1                 |
| 安装位置 | 集群所有主机           | 集群所有主机                                  | 集群所有主机           |
| 作用     | 初始化集群、管理集群等 | 用于接收api-server指令，对pod生命周期进行管理 | 集群应用命令行管理工具 |



### 2.3.2  kubernetes YUM源准备



#### 2.3.2.1 谷歌YUM源 [国外主机]

```
$  cat <<EOF > /etc/yum.repos.d/kubernetes.repo
[kubernetes]
name=Kubernetes
baseurl=https://packages.cloud.google.com/yum/repos/kubernetes-el7-x86_64
enabled=1
gpgcheck=0
repo_gpgcheck=0
gpgkey=https://packages.cloud.google.com/yum/doc/yum-key.gpg https://packages.cloud.google.com/yum/doc/rpm-package-key.gpg
EOF        
```



#### 2.3.2.2 阿里云YUM源【国内主机】

```
$ cat <<EOF > /etc/yum.repos.d/kubernetes.repo
[kubernetes]
name=Kubernetes
baseurl=http://mirrors.aliyun.com/kubernetes/yum/repos/kubernetes-el7-x86_64
enabled=1
gpgcheck=0
repo_gpgcheck=0
gpgkey=http://mirrors.aliyun.com/kubernetes/yum/doc/yum-key.gpg
        http://mirrors.aliyun.com/kubernetes/yum/doc/rpm-package-key.gpg
EOF

$ yum clean all && yum makecache
```



### 2.3.3 集群软件安装

> 所有节点均可安装

```
# 查看所有的可用版本
$  yum list  kubeadm  kubelet kubectl --showduplicates | sort -r



# 默认安装的版本就是最新版1.24.X，当然也可以指定版本安装 ，如 yum install kubelet-1.16.2 kubeadm-1.16.2 kubectl-1.16.2
$ yum install  kubeadm  kubelet kubectl

#安装后查看版本
$ kubeadm version
kubeadm version: &version.Info{Major:"1", Minor:"24", GitVersion:"v1.24.1", GitCommit:"3ddd0f45aa91e2f30c70734b175631bec5b5825a", GitTreeState:"clean", BuildDate:"2022-05-24T12:24:38Z", GoVersion:"go1.18.2", Compiler:"gc", Platform:"linux/amd64"}


设置kubelet为开机自启动即可，由于没有生成配置文件，集群初始化后自动启动
$ systemctl enable kubelet

```





### 2.3.4 配置kubelet

>为了实现docker使用的cgroupdriver与kubelet使用的cgroup的一致性，建议修改如下文件内容。



```
$ cat <<EOF > /etc/sysconfig/kubelet
KUBELET_EXTRA_ARGS="--cgroup-driver=systemd"
EOF
```





### 2.3.5  初始化配置文件

> 只在master节点（`k8s-master`01）执行

```
$ kubeadm config print init-defaults > kubeadm.yaml
```

> 修改配置文件

```
apiVersion: kubeadm.k8s.io/v1beta3
bootstrapTokens:
- groups:
  - system:bootstrappers:kubeadm:default-node-token
  token: abcdef.0123456789abcdef
  ttl: 24h0m0s
  usages:
  - signing
  - authentication
kind: InitConfiguration
localAPIEndpoint:
  advertiseAddress: 172.16.200.30
  bindPort: 6443
nodeRegistration:
  criSocket: unix:///var/run/cri-docker.sock
  imagePullPolicy: IfNotPresent
  name: k8s-master01
  taints: null
---
apiServer:
  timeoutForControlPlane: 4m0s
apiVersion: kubeadm.k8s.io/v1beta3
certificatesDir: /etc/kubernetes/pki
clusterName: kubernetes
controllerManager: {}
dns: {}
etcd:
  local:
    dataDir: /var/lib/etcd
imageRepository: registry.aliyuncs.com/google_containers
kind: ClusterConfiguration
kubernetesVersion: 1.24.1
networking:
  dnsDomain: cluster.local
  serviceSubnet: 10.96.0.0/12
  podSubnet: 10.224.0.0/16 # pod子网
scheduler: {}



---
apiVersion: kubeproxy.config.k8s.io/v1alpha1
kind: KubeProxyConfiguration
mode: ipvs


```





### 2.3.6  集群镜像准备

> 只在master节点（`k8s-master`01）执行

```
 # 查看需要使用的镜像列表,若无问题，将得到如下列表
$ kubeadm config images list --config kubeadm.yaml 
registry.aliyuncs.com/google_containers/kube-apiserver:v1.24.1
registry.aliyuncs.com/google_containers/kube-controller-manager:v1.24.1
registry.aliyuncs.com/google_containers/kube-scheduler:v1.24.1
registry.aliyuncs.com/google_containers/kube-proxy:v1.24.1
registry.aliyuncs.com/google_containers/pause:3.7
registry.aliyuncs.com/google_containers/etcd:3.5.3-0
registry.aliyuncs.com/google_containers/coredns:v1.8.6


# 提前下载镜像到本地
$ kubeadm config images pull --config kubeadm.yaml 
[config/images] Pulled registry.aliyuncs.com/google_containers/kube-apiserver:v1.24.1
[config/images] Pulled registry.aliyuncs.com/google_containers/kube-controller-manager:v1.24.1
[config/images] Pulled registry.aliyuncs.com/google_containers/kube-scheduler:v1.24.1
[config/images] Pulled registry.aliyuncs.com/google_containers/kube-proxy:v1.24.1
[config/images] Pulled registry.aliyuncs.com/google_containers/pause:3.7
[config/images] Pulled registry.aliyuncs.com/google_containers/etcd:3.5.3-0
[config/images] Pulled registry.aliyuncs.com/google_containers/coredns:v1.8.6


$ docker images
REPOSITORY                                                        TAG       IMAGE ID       CREATED        SIZE
registry.aliyuncs.com/google_containers/kube-apiserver            v1.24.1   e9f4b425f919   7 days ago     130MB
registry.aliyuncs.com/google_containers/kube-controller-manager   v1.24.1   b4ea7e648530   7 days ago     119MB
registry.aliyuncs.com/google_containers/kube-scheduler            v1.24.1   18688a72645c   7 days ago     51MB
registry.aliyuncs.com/google_containers/kube-proxy                v1.24.1   beb86f5d8e6c   7 days ago     110MB
registry.aliyuncs.com/google_containers/etcd                      3.5.3-0   aebe758cef4c   6 weeks ago    299MB
registry.aliyuncs.com/google_containers/pause                     3.7       221177c6082a   2 months ago   711kB
registry.aliyuncs.com/google_containers/coredns                   v1.8.6    a4ca41631cc7   7 months ago   46.8MB

```





> 备注： 离线环境下载镜像，可使用docker-save 实现

```
# cat image_download.sh
#!/bin/
images_list='
registry.aliyuncs.com/google_containers/kube-apiserver:v1.24.1
registry.aliyuncs.com/google_containers/kube-controller-manager:v1.24.1
registry.aliyuncs.com/google_containers/kube-scheduler:v1.24.1
registry.aliyuncs.com/google_containers/kube-proxy:v1.24.1
registry.aliyuncs.com/google_containers/pause:3.7
registry.aliyuncs.com/google_containers/etcd:3.5.3-0
registry.aliyuncs.com/google_containers/coredns:v1.8.6

for i in $images_list
do
        docker pull $i
done

docker save -o k8s-1-24-1.tar $images_list
```





### 2.3.7 集群初始化

> 只在master节点（`k8s-master`01）执行

```
kubeadm init --config=kubeadm.yaml
```



```
# 重置 如果有需要，必须要指定--cri-socket，不然会报错

kubeadm reset --cri-socket unix:///var/run/cri-docker.sock
```





```
初始化过程输出
[root@localhost ~]# kubeadm config images pull --config=init.default.yaml --v=5
I0604 10:03:37.133902    2673 initconfiguration.go:255] loading configuration from "init.default.yaml"
I0604 10:03:37.136354    2673 kubelet.go:214] the value of KubeletConfiguration.cgroupDriver is empty; setting it to "systemd"
[config/images] Pulled registry.aliyuncs.com/google_containers/kube-apiserver:v1.24.1
[config/images] Pulled registry.aliyuncs.com/google_containers/kube-controller-manager:v1.24.1
[config/images] Pulled registry.aliyuncs.com/google_containers/kube-scheduler:v1.24.1
[config/images] Pulled registry.aliyuncs.com/google_containers/kube-proxy:v1.24.1
[config/images] Pulled registry.aliyuncs.com/google_containers/pause:3.7
[config/images] Pulled registry.aliyuncs.com/google_containers/etcd:3.5.3-0
[config/images] Pulled registry.aliyuncs.com/google_containers/coredns:v1.8.6
[root@localhost ~]# kubeadm init --config=init.default.yaml
[init] Using Kubernetes version: v1.24.1
[preflight] Running pre-flight checks
[preflight] Pulling images required for setting up a Kubernetes cluster
[preflight] This might take a minute or two, depending on the speed of your internet connection
[preflight] You can also perform this action in beforehand using 'kubeadm config images pull'
[certs] Using certificateDir folder "/etc/kubernetes/pki"
[certs] Generating "ca" certificate and key
[certs] Generating "apiserver" certificate and key
[certs] apiserver serving cert is signed for DNS names [kubernetes kubernetes.default kubernetes.default.svc kubernetes.default.svc.cluster.local master-1] and IPs [10.96.0.1 172.16.200.30]
[certs] Generating "apiserver-kubelet-client" certificate and key
[certs] Generating "front-proxy-ca" certificate and key
[certs] Generating "front-proxy-client" certificate and key
[certs] Generating "etcd/ca" certificate and key
[certs] Generating "etcd/server" certificate and key
[certs] etcd/server serving cert is signed for DNS names [localhost master-1] and IPs [172.16.200.30 127.0.0.1 ::1]
[certs] Generating "etcd/peer" certificate and key
[certs] etcd/peer serving cert is signed for DNS names [localhost master-1] and IPs [172.16.200.30 127.0.0.1 ::1]
[certs] Generating "etcd/healthcheck-client" certificate and key
[certs] Generating "apiserver-etcd-client" certificate and key
[certs] Generating "sa" key and public key
[kubeconfig] Using kubeconfig folder "/etc/kubernetes"
[kubeconfig] Writing "admin.conf" kubeconfig file
[kubeconfig] Writing "kubelet.conf" kubeconfig file
[kubeconfig] Writing "controller-manager.conf" kubeconfig file
[kubeconfig] Writing "scheduler.conf" kubeconfig file
[kubelet-start] Writing kubelet environment file with flags to file "/var/lib/kubelet/kubeadm-flags.env"
[kubelet-start] Writing kubelet configuration to file "/var/lib/kubelet/config.yaml"
[kubelet-start] Starting the kubelet
[control-plane] Using manifest folder "/etc/kubernetes/manifests"
[control-plane] Creating static Pod manifest for "kube-apiserver"
[control-plane] Creating static Pod manifest for "kube-controller-manager"
[control-plane] Creating static Pod manifest for "kube-scheduler"
[etcd] Creating static Pod manifest for local etcd in "/etc/kubernetes/manifests"
[wait-control-plane] Waiting for the kubelet to boot up the control plane as static Pods from directory "/etc/kubernetes/manifests". This can take up to 4m0s
[apiclient] All control plane components are healthy after 16.503761 seconds
[upload-config] Storing the configuration used in ConfigMap "kubeadm-config" in the "kube-system" Namespace
[kubelet] Creating a ConfigMap "kubelet-config" in namespace kube-system with the configuration for the kubelets in the cluster
[upload-certs] Skipping phase. Please see --upload-certs
[mark-control-plane] Marking the node master-1 as control-plane by adding the labels: [node-role.kubernetes.io/control-plane node.kubernetes.io/exclude-from-external-load-balancers]
[mark-control-plane] Marking the node master-1 as control-plane by adding the taints [node-role.kubernetes.io/master:NoSchedule node-role.kubernetes.io/control-plane:NoSchedule]
[bootstrap-token] Using token: abcdef.0123456789abcdef
[bootstrap-token] Configuring bootstrap tokens, cluster-info ConfigMap, RBAC Roles
[bootstrap-token] Configured RBAC rules to allow Node Bootstrap tokens to get nodes
[bootstrap-token] Configured RBAC rules to allow Node Bootstrap tokens to post CSRs in order for nodes to get long term certificate credentials
[bootstrap-token] Configured RBAC rules to allow the csrapprover controller automatically approve CSRs from a Node Bootstrap Token
[bootstrap-token] Configured RBAC rules to allow certificate rotation for all node client certificates in the cluster
[bootstrap-token] Creating the "cluster-info" ConfigMap in the "kube-public" namespace
[kubelet-finalize] Updating "/etc/kubernetes/kubelet.conf" to point to a rotatable kubelet client certificate and key
[addons] Applied essential addon: CoreDNS
[addons] Applied essential addon: kube-proxy

Your Kubernetes control-plane has initialized successfully!

To start using your cluster, you need to run the following as a regular user:

  mkdir -p $HOME/.kube
  sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
  sudo chown $(id -u):$(id -g) $HOME/.kube/config

Alternatively, if you are the root user, you can run:

  export KUBECONFIG=/etc/kubernetes/admin.conf

You should now deploy a pod network to the cluster.
Run "kubectl apply -f [podnetwork].yaml" with one of the options listed at:
  https://kubernetes.io/docs/concepts/cluster-administration/addons/

Then you can join any number of worker nodes by running the following on each as root:

kubeadm join 172.16.200.30:6443 --token abcdef.0123456789abcdef \
	--discovery-token-ca-cert-hash sha256:8a55d1074d4d74804ee493119a94902d816e2b185444b19398353585a1588120 

```



### 2.3.7  集群应用客户端管理集群文件准备

```
[root@k8s-master01 ~]# mkdir -p $HOME/.kube
[root@k8s-master01 ~]# cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
[root@k8s-master01 ~]# chown $(id -u):$(id -g) $HOME/.kube/config
[root@k8s-master01 ~]# ls /root/.kube/
config
```



```
[root@k8s-master01 ~]# export KUBECONFIG=/etc/kubernetes/admin.conf
```



### 2.3.8  集群工作节点添加



```
[root@k8s-node1 ~]# kubeadm join 172.16.200.30:6443 --token 8x4o2u.hslo8xzwwlrncr8s \                              --discovery-token-ca-cert-hash sha256:7323a8b0658fc33d89e627f078f6eb16ac94394f9a91b3335dd3ce73a3f313a0 --cri-socket unix:///var/run/cri-dockerd.sock
```



```
[root@k8s-node2 ~]# kubeadm join 172.16.200.30:6443 --token 8x4o2u.hslo8xzwwlrncr8s \
        --discovery-token-ca-cert-hash sha256:7323a8b0658fc33d89e627f078f6eb16ac94394f9a91b3335dd3ce73a3f313a0 --cri-socket unix:///var/run/cri-dockerd.sock
```

注意： 必须要加上 --cri-socket unix:///var/run/cri-dockerd.sock ，不然会报错



```
[root@k8s-master01 ~]# kubectl get nodes
NAME           STATUS     ROLES           AGE     VERSION
k8s-master01   NotReady   control-plane   2m24s   v1.24.1
k8s-node1      NotReady   <none>          23s     v1.24.1
k8s-node2      NotReady   <none>          2s      v1.24.1

```





### 2.3.9  去除污点，设置master节点参与调度

```
#查看污点 
kubectl describe node master | grep -i taint
Taints:             node-role.kubernetes.io/master:NoSchedule

#去除污点
 kubectl taint node k8s-master01 node-role.kubernetes.io/master:NoSchedule-

```





### 2.3.10  集群网络准备



#### 2.3.10.1  calico安装

```
wget https://docs.projectcalico.org/manifests/calico.yaml --no-check-certificate


vim  calico.yaml 
................
  name: CALICO_IPV4POOL_CIDR
  value: "10.244.0.0/16"
................
```



```
[root@kubesphere ~]# kubectl apply -f calico.yaml 
```



```
监视kube-system命名空间中pod运行情况
[root@k8s-master01 ~]# watch kubectl get pods -n kube-system
```



```
已经全部运行
[root@k8s-master01 ~]# kubectl get pods -n kube-system
NAME                                       READY   STATUS    RESTARTS      AGE
calico-kube-controllers-56cdb7c587-szkjr   1/1     Running   0             11m
calico-node-6xzg7                          1/1     Running   0             11m
coredns-74586cf9b6-bbhq6                   1/1     Running   2             35m
coredns-74586cf9b6-g6shr                   1/1     Running   2             35m
etcd-master-1                              1/1     Running   3             35m
kube-apiserver-master-1                    1/1     Running   3             35m
kube-controller-manager-master-1           1/1     Running   2             35m
kube-proxy-bbb2t                           1/1     Running   2             35m
kube-scheduler-master-1                    1/1     Running   2             35m

```



#### 2.3.10.2  calico客户端安装



```
下载二进制文件
# curl -L https://github.com/projectcalico/calico/releases/download/v3.23.1/calicoctl-linux-amd64 -o calicoctl
```



```
安装calicoctl
# mv calicoctl /usr/bin/

为calicoctl添加可执行权限
# chmod +x /usr/bin/calicoctl

查看添加权限后文件
# ls /usr/bin/calicoctl
/usr/bin/calicoctl

查看calicoctl版本
# calicoctl  version
Client Version:    v3.23.1
Git commit:        967e24543
Cluster Version:   v3.23.1
Cluster Type:      k8s,bgp,kubeadm,kdd
```





```
通过~/.kube/config连接kubernetes集群，查看已运行节点
$ DATASTORE_TYPE=kubernetes 
$ KUBECONFIG=~/.kube/config 
$ calicoctl get nodes
NAME           
k8s-master01   
k8s-node1      
k8s-node2      
```







### 2.3.11 验证集群可用性

```
查看所有的节点

[root@k8s-master01 ~]# kubectl get nodes
NAME           STATUS   ROLES           AGE   VERSION
k8s-master01   Ready    control-plane   28m   v1.24.1
k8s-node1      Ready    <none>          26m   v1.24.1
k8s-node2      Ready    <none>          26m   v1.24.1

```



```
查看集群健康情况
[root@k8s-master01 ~]# kubectl get cs
Warning: v1 ComponentStatus is deprecated in v1.19+
NAME                 STATUS    MESSAGE                         ERROR
controller-manager   Healthy   ok
scheduler            Healthy   ok
etcd-0               Healthy   {"health":"true","reason":""}
```



### 2.3.12  k8s其他设置

> kubectl 命令自动补齐

```
yum install bash-completion -y
source /usr/share/bash-completion/bash_completion
source <(kubectl completion bash)
kubectl completion bash >/etc/bash_completion.d/kubectl
```





# 三、参考

* https://www.bilibili.com/video/BV1uY411c7qU?p=3&spm_id_from=333.880.my_history.page.click
* https://www.jianshu.com/p/a613f64ccab6
* https://i4t.com/5435.html
* https://www.bilibili.com/video/BV1gS4y1B7Ut?spm_id_from=333.880.my_history.page.click
