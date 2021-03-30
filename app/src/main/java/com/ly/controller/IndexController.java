package com.ly.controller;

import java.util.Date;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import org.springframework.stereotype.Controller;
import org.springframework.ui.ModelMap;
import org.springframework.web.bind.annotation.RequestMapping;

import lombok.extern.slf4j.Slf4j;

/**
 * IndexController
 * @author lizibin
 *
 */
@Controller
@Slf4j
public class IndexController {

	@RequestMapping("/")
	public String index(HttpServletRequest request, HttpServletResponse response,ModelMap model){
		log.info("----------------请求访问index页面--------------->");
		return "index";
	}
}
