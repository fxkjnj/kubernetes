

# Prometheus+Grafana监控K8s

# Prometheus 介绍

Prometheus（普罗米修斯）是一个最初在SoundCloud上构建的监控系统。自2012年成为社区开源项目，
拥有非常活跃的开发人员和用户社区。为强调开源及独立维护，Prometheus于2016年加入云原生云计算基
金会（CNCF），成为继Kubernetes之后的第二个托管项目。
https://prometheus.io
https://github.com/prometheus



# Prometheus组件与架构

![](http://jpg.fxkjnj.com/soft/prometheus/2.png)

• Prometheus Server：收集指标和存储时间序列数据，并提供查询接口

• ClientLibrary：客户端库

• Push Gateway：短期存储指标数据。主要用于临时性的任务

• Exporters：采集已有的第三方服务监控指标并暴露metrics

• Alertmanager：告警

• Web UI：简单的Web控制台

# Kubernetes 监控指标

**Kubernetes本身监控**

• Node资源利用率

• Node数量

• 每个Node运行Pod数量

• 资源对象状态



**Pod监控**

• Pod总数量及每个控制器预期数量

• Pod状态

• 容器资源利用率：CPU、内存、网络

# Kubernetes 监控实现思路

![](http://jpg.fxkjnj.com/soft/kubernetes/1.png)

![](http://jpg.fxkjnj.com/soft/kubernetes/2.png)

  

## Pod
kubelet的节点使用cAdvisor提供的metrics接口获取该节点所有Pod和容器相关的性能指标数据。
指标接口：https://NodeIP:10250/metrics/cadvisor   

## Node
使用node_exporter收集器采集节点资源利用率。
项目地址：https://github.com/prometheus/node_exporter

## K8s资源对象
kube-state-metrics采集了k8s中各种资源对象的状态信息。
项目地址：https://github.com/kubernetes/kube-state-metrics

支持采集各种资源对象的状态信息：
![](http://jpg.fxkjnj.com/soft/kubernetes/kube-state-metrics.png)


```
下面这些是kube-state-metrics 官方宣称支持的采集对象
.CertificateSigningRequest Metrics
.ConfigMap Metrics
.CronJob Metrics
.DaemonSet Metrics
.Deployment Metrics
.Endpoint Metrics
.Horizontal Pod Autoscaler Metrics
.Ingress Metrics
.Job Metrics
.Lease Metrics
.LimitRange Metrics
.MutatingWebhookConfiguration Metrics
.Namespace Metrics
.NetworkPolicy Metrics
.Node Metrics
.PersistentVolume Metrics
.PersistentVolumeClaim Metrics
.Pod Disruption Budget Metrics
.Pod Metrics
.ReplicaSet Metrics
.ReplicationController Metrics
.ResourceQuota Metrics
.Secret Metrics
.Service Metrics
.StatefulSet Metrics
.StorageClass Metrics
.ValidatingWebhookConfiguration Metrics
.VerticalPodAutoscaler Metrics
.VolumeAttachment Metrics
```


# Kubernetes 平台部署的相关组件&Yaml
PS: 部署相关组件之前需提前部署好动态PV 

```
prometheus-deployment.yaml 					#部署Prometheus
prometheus-configmap.yaml 					# Prometheus配置文件，主要配置Kubernetes服务发现
prometheus-rules.yaml 							# Prometheus告警规则
grafana.yaml												# 可视化展示
node-exporter.yml 									#采集节点资源，通过DaemonSet方式部署，并声明让Prometheus收集
kube-state-metrics.yaml 						#采集K8s资源，并声明让Prometheus收集
alertmanager-configmap.yaml 				#配置文件，配置发件人和收件人
alertmanager-deployment.yaml 				#部署Alertmanager告警组件
alertmanager-template.yaml					#添加alertmanager自定义告警模板
```

# Grafana 展示 k8s 监控图

模板见： https://github.com/fxkjnj/kubernetes/tree/main/k8s-prometheus/grafana-demo_json

直接导入即可

![](http://jpg.fxkjnj.com/soft/kubernetes/dashboard-1.png)

![](http://jpg.fxkjnj.com/soft/kubernetes/dashboard-2.png)

![](http://jpg.fxkjnj.com/soft/kubernetes/dashboard-3.png)



# K8S 中部署 altermanager

Prometheus报警功能利用Alertmanager组件完成，当Prometheus会对接收的指标数据比对告警规则，如果

满足条件，则将告警事件发送给Alertmanager组件，Alertmanager组件发送到接收人。

使用步骤：

1. 部署Alertmanager

2. 配置告警接收人

3. 配置Prometheus与Alertmanager通信

4. 在Prometheus中创建告警规则

   

![](http://jpg.fxkjnj.com/soft/prometheus/alertmanager.png)

模拟告警


![](http://jpg.fxkjnj.com/soft/prometheus/alertmanager-1.jpeg)



![](http://jpg.fxkjnj.com/soft/prometheus/alertmanager-2.png)

![](http://jpg.fxkjnj.com/soft/prometheus/alertmanager-3.png)
