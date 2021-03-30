$(function(){
	layui.use(['form','layer'], function(){
		var form = layui.form;
		var layer = layui.layer;
		  //监听提交
		  form.on('submit(formUser)', function(data){
			  //ajax 提交
		      $.post('/addUser',data.field,function(result){
		    	  if("ok"==result){
					  layer.msg("添加成功。",{icon:1,time:2000},function(){
						  var index = parent.layer.getFrameIndex("addUser"); 
				    	  parent.layer.close(index); //再执行关闭   
					  });
				  }else{
					  layer.msg("添加失败。",{icon:0});
				  }
		   		      });
			  return false;
		  });
	});
});
