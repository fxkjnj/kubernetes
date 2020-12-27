cfssl gencert -initca ca-csr.json | cfssljson -bare ca -
cfssl gencert -ca=ca.pem -ca-key=ca-key.pem -config=ca-config.json -profile=kubernetes server-csr.json | cfssljson -bare server
cfssl gencert -ca=ca.pem -ca-key=ca-key.pem -config=ca-config.json -profile=kubernetes admin-csr.json | cfssljson -bare admin
cfssl gencert -ca=ca.pem -ca-key=ca-key.pem -config=ca-config.json -profile=kubernetes kube-proxy-csr.json | cfssljson -bare kube-proxy

# 拷贝到使用证书的roles下
root_dir=$(pwd |sed 's#ssl/k8s##')
apiserver_cert_dir=$root_dir/roles/master/files/k8s_cert
node_cert_dir=$root_dir/roles/node/files/k8s_cert
mkdir -p $apiserver_cert_dir $node_cert_dir
cp -rf *.pem $apiserver_cert_dir
cp -rf ca.pem kube-proxy-key.pem kube-proxy.pem $node_cert_dir
