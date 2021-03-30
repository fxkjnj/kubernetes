package com.ly.dto;

import java.util.List;

import lombok.Data;

@Data
public class LayerDto<T> {
	
	private Integer code;
	
	private String msg;
	
	private long count;
	
	private List<T> data;

	public LayerDto(Integer code,String msg,long count, List<T> data) {
		this.code=code;
		this.msg=msg;
		this.count=count;
		this.data=data;
	}
}
