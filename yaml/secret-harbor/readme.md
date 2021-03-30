
##cat ~/.docker/config.json

``
{
        "auths": {
                "192.168.31.100": {
                        "auth": "YWReaWr6SGFyYm9yMTIzNDU="
                }
        },
        "HttpHeaders": {
                "User-Agent": "Docker-Client/19.03.9 (linux)"
        }
}
``
##使用 cat ~/.docker/config.json| base64    进行编码
[root@master-1 .docker]# cat config.json | base64
ewoJImF1dGhzIjogewoJCSIxOTIuMTY4LjMxLjEwMCI6IHsKCQkJImF1dGgiOiAiWVdSdGFXNDZT
R0Z5WW05eU1USXpORFU9IgoJCX0KCX0sCgkiSHR0cEhlYWRlcnMiOiB7CgkJIlVzZXItQWdlbnQi
OiAiRG9ja2VyLUNsaWVudC8xOS4wMy45IChsaW51eCkiCgl9Cn0=

[root@manager ~]# vim registry-pull-secret.yaml  ###注意base64 的结果要写成一行
apiVersion: v1
kind: Secret
metadata:
  name: registry-pull-secret
data:
  .dockerconfigjson: ewoJImF1dGhzIjogewoJCSIxOTIuMTY4LjMxLjEwMCI6IHsKCQkJImF1dGgiOiAiWVdSdGFXNDZTR0Z5WW05eU1USXpORFU9IgoJCX0KCX0sCgkiSHR0cEhlYWRlcnMiOiB7CgkJIlVzZXItQWdlbnQiOiAiRG9ja2VyLUNsaWVudC8xOS4wMy45IChsaW51eCkiCgl9Cn0=
type: kubernetes.io/dockerconfigjson
