EFK Stack日志系统收集K8s中日志



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

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-1-1.png)



针对标准输出：以DaemonSet方式在每个Node上部署一个日志收集程序，采集/var/lib/docker/containers/目录下所有容器日志



针对容器中日志文件：在Pod中增加一个容器运行日志采集器，使用emtyDir共享日志目录让日志采集器读取到日志文件





## 五、EFK Stack日志系统

![](http://jpg.fxkjnj.com/soft/kubernetes/ELK-2.png)
<hr1>

EFK 是三个开源软件的缩写，提供一套完整的企业级日  志平台解决方案。
分别是：

    • Elasticsearch：搜索、分析和存储数据
    
    • Filebeat ：是本地文件的日志数据采集器,可监控日志目录或特定日志文件,并将它们转发给Elasticsearch或Logstatsh进行索引、kafka等
    
    • Kibana：数据可视化


## 六、EFK部署方式
### 1、es-single-node 部署ES 单点+ filebeat + kibana 实现Kubernetes应用日志收集
### 2、es-cluster     Kubernetes Helm3 部署 ElasticSearch集群 & Kibana 7 展示日志




