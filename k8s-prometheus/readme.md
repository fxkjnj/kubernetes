# Kubernetes 监控实现思路
![](http://jpg.fxkjnj.com/soft/kubernetes/1.png)
![](http://jpg.fxkjnj.com/soft/kubernetes/2.png)

  

### Pod
kubelet的节点使用cAdvisor提供的metrics接口获取该节点所有Pod和容器相关的性能指标数据。
指标接口：https://NodeIP:10250/metrics/cadvisor   

### Node
使用node_exporter收集器采集节点资源利用率。
项目地址：https://github.com/prometheus/node_exporter

### K8s资源对象
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


# Kubernetes 平台部署的相关组件&yaml
#### 部署相关组件之前需提前部署好动态PV

```
prometheus-deployment.yaml 		#部署Prometheus
prometheus-configmap.yaml 		# Prometheus配置文件，主要配置Kubernetes服务发现
prometheus-rules.yaml 			# Prometheus告警规则
grafana.yaml				# 可视化展示
node-exporter.yml 			#采集节点资源，通过DaemonSet方式部署，并声明让Prometheus收集
kube-state-metrics.yaml 		#采集K8s资源，并声明让Prometheus收集
alertmanager-configmap.yaml 		#配置文件，配置发件人和收件人
alertmanager-deployment.yaml 		#部署Alertmanager告警组件
```


# Grafana 展示 k8s 监控图

![](http://jpg.fxkjnj.com/soft/kubernetes/dashboard-1.png)

![](http://jpg.fxkjnj.com/soft/kubernetes/dashboard-2.png)

![](http://jpg.fxkjnj.com/soft/kubernetes/dashboard-3.png)


# K8S 中部署 altermanager

![](http://jpg.fxkjnj.com/soft/prometheus/alertmanager.png)





