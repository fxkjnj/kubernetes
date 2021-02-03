cfssl gencert -initca ca-csr.json | cfssljson -bare ca -
cfssl gencert -ca=ca.pem -ca-key=ca-key.pem -config=ca-config.json -profile=www server-csr.json | cfssljson -bare server

# 拷贝到使用证书的roles下
root_dir=$(pwd |sed 's#ssl/etcd##')
apiserver_cert_dir=$root_dir/roles/master/files/etcd_cert
etcd_cert_dir=$root_dir/roles/etcd/files/etcd_cert
mkdir -p $etcd_cert_dir $apiserver_cert_dir
for dir in $apiserver_cert_dir $etcd_cert_dir; do
   cp -rf ca.pem server.pem server-key.pem $dir
done
