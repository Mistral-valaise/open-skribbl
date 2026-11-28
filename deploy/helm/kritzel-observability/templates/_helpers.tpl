{{/* Name of the umbrella release's own objects. */}}
{{- define "kritzel-obs.fullname" -}}
{{- .Release.Name | trunc 52 | trimSuffix "-" -}}
{{- end -}}

{{/* Common labels on objects created directly by the umbrella chart. */}}
{{- define "kritzel-obs.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/part-of: kritzel
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{/* Guard against missing Grafana Secret or inline passwords in values. */}}
{{- define "kritzel-obs.validate" -}}
{{- if or (hasKey .Values.grafana "adminPassword") (hasKey .Values.grafana "password") -}}
{{- fail "Do not put a Grafana password in chart values: create a Secret in the namespace and pass its name in grafana.admin.existingSecret" -}}
{{- end -}}
{{- $secret := ((.Values.grafana.admin).existingSecret) | default "" -}}
{{- if not $secret -}}
{{- fail "grafana.admin.existingSecret is required: create a Secret with key admin-password and pass --set grafana.admin.existingSecret=<name>" -}}
{{- end -}}
{{- $images := list
  (printf "%s@%s" (index .Values "opentelemetry-collector").image.repository (index .Values "opentelemetry-collector").image.digest)
  (printf "%s@%s" .Values.prometheus.server.image.repository .Values.prometheus.server.image.digest)
  (printf "%s@%s" .Values.loki.loki.image.repository .Values.loki.loki.image.digest)
  (printf "%s:%s" .Values.tempo.tempo.repository .Values.tempo.tempo.tag)
  (printf "%s:%s@sha256:%s" .Values.grafana.image.repository .Values.grafana.image.tag .Values.grafana.image.sha)
-}}
{{- range $images -}}
{{- if not (regexMatch "@sha256:[0-9a-f]{64}$" .) -}}
{{- fail (printf "observability images must be pinned by sha256 digest, got %q" .) -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Subchart Service names derived from the umbrella release name. */}}
{{- define "kritzel-obs.collectorService" -}}
{{- printf "%s-opentelemetry-collector" .Release.Name -}}
{{- end -}}
{{- define "kritzel-obs.prometheusService" -}}
{{- printf "%s-prometheus-server" .Release.Name -}}
{{- end -}}
{{- define "kritzel-obs.lokiService" -}}
{{- printf "%s-loki" .Release.Name -}}
{{- end -}}
{{- define "kritzel-obs.tempoService" -}}
{{- printf "%s-tempo" .Release.Name -}}
{{- end -}}
{{- define "kritzel-obs.grafanaService" -}}
{{- printf "%s-grafana" .Release.Name -}}
{{- end -}}
