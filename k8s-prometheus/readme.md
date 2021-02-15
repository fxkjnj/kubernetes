# Kubernetes 监控实现思路
### Pod
kubelet的节点使用cAdvisor提供的metrics接口获取该节点所有Pod和容器相关的性能指标数据。
指标接口：https://NodeIP:10250/metrics/cadvisor

### Node
使用node_exporter收集器采集节点资源利用率。
项目地址：https://github.com/prometheus/node_exporter

### K8s资源对象
kube-state-metrics采集了k8s中各种资源对象的状态信息。
项目地址：https://github.com/kubernetes/kube-state-metrics


# Kubernetes 平台部署的相关组件&yaml


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
