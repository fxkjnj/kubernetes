package com.ly.model;

import lombok.Data;
import lombok.ToString;

@Data
@ToString(of = {"name","age","sex"}) 
public class User {
	
	private String name;
	
	private int age;
	
	private String sex;

}
