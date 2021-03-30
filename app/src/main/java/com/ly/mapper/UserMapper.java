package com.ly.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.SelectProvider;

import com.ly.model.User;

public interface  UserMapper {
	
	@SelectProvider(type=UserSqlProvider.class,method="selectName")
	List<User> queryuserList(String name);

	@Select("select * from user where name LIKE CONCAT('%',#{name},'%')")
	User findByName(@Param("name") String name);
	
	@Insert("insert into user(name, age,sex) values(#{name}, #{age},#{sex})")
	int insert(@Param("name") String name, @Param("age") Integer age,@Param("sex") String sex);
}
