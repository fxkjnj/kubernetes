package com.ly.mapper;

public class UserSqlProvider {
	 /**
     * 查询语句.
     * @return
     */
    public String selectName(String name){
       StringBuffer sql = new StringBuffer("select * from user where 1=1 ");
       if(name != null){
           sql.append(" and  name LIKE CONCAT('%',#{name},'%')");
       }
       return sql.toString();
    }
}
