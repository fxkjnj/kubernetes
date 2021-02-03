{{- define "demo.fullname" -}}
{{- .Chart.Name -}}-{{ .Release.Name }}
{{- end -}}

{{/*
公用标签
*/}}
{{- define "demo.labels" -}}
app: {{ template "demo.fullname" . }}
chart: "{{ .Chart.Name }}-{{ .Chart.Version }}"
release: "{{ .Release.Name }}"
{{- end -}}

{{/*
标签选择器
*/}}
{{- define "demo.selectorLabels" -}}
app: {{ template "demo.fullname" . }}
release: "{{ .Release.Name }}"
{{- end -}}
