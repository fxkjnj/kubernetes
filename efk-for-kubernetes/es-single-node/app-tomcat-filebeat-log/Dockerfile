FROM centos
MAINTAINER fxkjnj.com fxkj
EXPOSE 8080
WORKDIR /opt

#ADD jdk1.8
    COPY jdk1.8.0_66.tar.gz /opt
    RUN tar zxf /opt/jdk1.8.0_66.tar.gz -C /usr/local/ && rm -rf /opt/jdk1.8.0_66.tar.gz
    RUN ln -s /usr/local/jdk1.8.0_66 /usr/local/jdk
#环境变量/etc/profile
    ENV JAVA_HOME /usr/local/jdk
    ENV CLASSPATH=.:$JAVA_HOME/jre/lib/rt.jar:$JAVA_HOME/lib/dt.jar:$JAVA_HOME/lib/tools.jar
    ENV PATH $PATH:$JAVA_HOME/bin

#ADD tomcat8
    COPY apache-tomcat-8.5.39.tar.gz /opt
    RUN tar zxf apache-tomcat-8.5.39.tar.gz -C /usr/local  && rm -rf apache-tomcat-8.5.39.tar.gz
    RUN mv /usr/local/apache-tomcat-8.5.39 /usr/local/tomcat

#CMD
ENTRYPOINT /usr/local/tomcat/bin/startup.sh && tail -f /usr/local/tomcat/logs/catalina.out
