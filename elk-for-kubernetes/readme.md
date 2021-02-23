## ELK Stack日志系统收集K8s中日志

## 日志收集的需求背景：



​			• 业务发展越来越庞大，服务器越来越多

​			• 各种访问日志、应用日志、错误日志量越来越多

​			• 开发人员排查问题，需要到服务器上查日志，效率低、权限不好控制

​			• 运维需实时关注业务访问情况





## 容器特性给日志采集带来的难度：

​			• K8s弹性伸缩性：导致不能预先确定采集的目标
​			• 容器隔离性：容器的文件系统与宿主机是隔离，导致日志采集器读取日志文件受阻






## 应用程序日志记录分为两类：

​			• 标准输出：输出到控制台，使用kubectl logs可以看到 (比如nginx 的日志就是输出到控制台)

​			• 日志文件：写到容器的文件系统的文件(比如tomcat的日志就是写入到容器中的文件系统的文件)






## Kubernetes应用日志收集

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-1.png)



**针对标准输出：**以DaemonSet方式在每个Node上部署一个日志收集程序，采集/var/lib/docker/containers/目录下所有容器日志



**针对容器中日志文件：**在Pod中增加一个容器运行日志采集器，使用emtyDir共享日志目录让日志采集器读取到日志文件





## ELK Stack日志系统

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-2.png)

ELK 是三个开源软件的缩写，提供一套完整的企业级日  志平台解决方案。

分别是：

​			• Elasticsearch：搜索、分析和存储数据

​			• Logstash ：采集日志、格式化、过滤，最后将数据推送到Elasticsearch存储

​			• Kibana：数据可视化

​			• Beats ：集合了多种单一用途数据采集器，用于实现从边缘机器向 Logstash 和 Elasticsearch 发送数

​			  				据。里面应用最多的是Filebeat，是一个轻量级日志采集器。



第一步：搭建日志系统：

​		• elasticsearch.yaml # ES数据库
​		• kibana.yaml # 可视化展示



第二步：标准输出容器日志收集：

​		• filebeat-kubernetes.yaml 	# 采集所有容器标准输出
​		• app-log-stdout.yaml 			# 标准输出的项目案例(nginx)



第三步：容器中日志文件收集：

​		• app-log-logfile.yaml 			# 日志文件的项目案例（nginx-php,这里的nginx 日志不会输入出到控制台，而															是直接入到/usr/local/nginx/logs 日志中）

### Kibana登陆后界面：



![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-4.png)





### 索引管理：

（一般只要有数据入到ES中就会有索引出现 ，如果没有出现可以试着访问下业务使其产生日志输出到ES中）

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-6.png)



### 添加索引模式：



![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-7.png)



### 数据查询界面：

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-5.png)
