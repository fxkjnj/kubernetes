'''
prometheus-deployment.yaml #部署Prometheus
prometheus-configmap.yaml # Prometheus配置文件，主要配置Kubernetes服务发现
prometheus-rules.yaml # Prometheus告警规则
grafana.yaml # 可视化展示
node-exporter.yml # 采集节点资源，通过DaemonSet方式部署，并声明让Prometheus收集
kube-state-metrics.yaml # 采集K8s资源，并声明让Prometheus收集
alertmanager-configmap.yaml # 配置文件，配置发件人和收件人
alertmanager-deployment.yaml # 部署Alertmanager告警组件
'''
