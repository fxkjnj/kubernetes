## jenkins 在Kubernetes中持续部署

资产信息：

|  主机名（IP）  |            用途            |  版本  |
| :------------: | :------------------------: | :----: |
| 192.168.31.100 | Harbor镜像仓库，NFS 服务器 | v2.1.0 |
| 192.168.31.200 |      Gitlab 代码仓库       | latest |
| 192.168.31.61  |      K8s-master 节点       | v1.18  |
| 192.168.31.62  |         node-1节点         | v1.18  |
| 192.168.31.63  |         node-2节点         | v1.18  |



一、了解发布流程

![](http://jpg.fxkjnj.com/soft/jenkins/cicd-jenkins-k8s.png)

流程：

- 拉取代码  git checkout
- 编译代码  mvn clean 
- 打包镜像 并上传镜像仓库
- 使用yaml 模板文件部署用镜像仓库中的镜像，生成pod
- 开发测试



二、使用 Gitlab 作为代码仓库 & 使用 Harbor 作为镜像仓库

2.1 部署Harbor作为镜像仓库

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















2.2 部署Gitlab作为代码仓库

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











三、在 Kubernetes 中部署 Jenkins



四、Jenkins在K8S中动态创建代理



五、构建Jenkins-Slave镜像



六、Jenkins Pipeline介绍，编写Jenkins Pipeline 声明式流水线脚本



七、Jenkins在Kubernetes中持续部署