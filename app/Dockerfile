FROM 192.168.31.100/library/tomcat8:latest
LABEL fxkjnj fxkjnj.com
RUN rm -rf /usr/local/tomcat/webapps/*
ADD target/*.war /usr/local/tomcat/webapps/ROOT.war 
