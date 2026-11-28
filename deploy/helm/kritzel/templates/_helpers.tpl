{{/* Name of the release's objects: the release name, unless it would repeat the chart name. */}}
{{- define "kritzel.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 52 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 52 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 52 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Name of one component's objects. Call with (dict "root" . "component" "game"). */}}
{{- define "kritzel.componentName" -}}
{{- if eq .component "game" -}}
{{- include "kritzel.fullname" .root -}}
{{- else -}}
{{- printf "%s-%s" (include "kritzel.fullname" .root) .component -}}
{{- end -}}
{{- end -}}

{{/* Labels that select one component's pods. */}}
{{- define "kritzel.selectorLabels" -}}
app.kubernetes.io/name: {{ default .root.Chart.Name .root.Values.nameOverride }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{/* Labels on every object. */}}
{{- define "kritzel.labels" -}}
{{ include "kritzel.selectorLabels" . }}
app.kubernetes.io/part-of: kritzel
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .root.Chart.Name .root.Chart.Version }}
{{- end -}}

{{/*
Pod security settings (spec 016): nothing here names a user or group, so
OpenShift's restricted-v2 constraint can assign them from the namespace's range.
*/}}
{{- define "kritzel.podSecurityContext" -}}
runAsNonRoot: true
{{- with .Values.securityContext.runAsUser }}
runAsUser: {{ . }}
{{- end }}
seccompProfile:
  type: RuntimeDefault
{{- end -}}

{{- define "kritzel.containerSecurityContext" -}}
runAsNonRoot: true
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop:
    - ALL
{{- end -}}

{{/* The game image, by digest when one is given. */}}
{{- define "kritzel.image" -}}
{{- if and .Values.requireImageDigest (not .Values.image.digest) -}}
{{- fail "image.digest is required by this profile: deploy an immutable image, for example --set image.digest=sha256:..." -}}
{{- end -}}
{{- if .Values.image.digest -}}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.repository .Values.image.tag -}}
{{- end -}}
{{- end -}}

{{/* OTLP endpoint the game exports to, or empty when telemetry is off. */}}
{{- define "kritzel.otlpEndpoint" -}}
{{- .Values.telemetry.otlpEndpoint -}}
{{- end -}}

{{/* Who may reach the game from outside the release. */}}
{{- define "kritzel.ingressFrom" -}}
{{- with .Values.networkPolicy.ingressFrom }}
from:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- end -}}

{{/* A peer that selects one component of this release. */}}
{{- define "kritzel.peer" -}}
- podSelector:
    matchLabels:
      {{- include "kritzel.selectorLabels" . | nindent 6 }}
{{- end -}}
