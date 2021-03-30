$(document).ready(function() {
	
	//markup for the clock		
			var clock = [
				'<ul id="clock">',
				'<li id="date"></li>',
				'<li id="seconds"></li>',
				'<li id="hours"></li>',
				'<li id="minutes"></li>',
				'</ul>'].join('');
		
		//fadein the clock and append it to the body		
		  $(clock).fadeIn().appendTo('.date');
			
			//an autoexecuting function that updates the clovk view every second
			//you can also use setInterval (function Clock (){})();
			(function Clock(){
		
		//get the date and time
              var date = new Date().getDate(),//get the current date
			   hours = new Date().getHours(),//get the current hour
               minutes = new Date().getMinutes();	//get the current minute
			   seconds = new Date().getSeconds(),//get the current second
			   
              $("#date").html(date); //show the current date on the clock
             
			 var hrotate = hours * 30 + (minutes / 2);
			 //i.e 12 hours * 30 = 360 degrees
                  
              $("#hours").css({
				  'transform'	:  'rotate('+ hrotate +'deg)',
				'-moz-transform'	:'rotate('+ hrotate +'deg)',
				'-webkit-transform'	:'rotate('+ hrotate +'deg)'
				  });
				  
			  var mrotate = minutes * 6; //degrees to rotate the minute hand
                        
              $("#minutes").css({
				'transform'	:  'rotate('+ mrotate +'deg)',
				'-moz-transform'	:'rotate('+ mrotate +'deg)',
				'-webkit-transform'	:'rotate('+ mrotate +'deg)'
				  });  
				  
              var srotate = seconds * 6;//for the rotation to reach 360 degrees
			  //i.e 60 seconds * 6 = 360 degrees.
              
              $("#seconds").css({
				 'transform'	:  'rotate('+ srotate +'deg)',
				'-moz-transform'	:'rotate('+ srotate +'deg)',
				'-webkit-transform'	:'rotate('+ srotate +'deg)'
				  });
             
             //a call to the clock function after every 1000 miliseconds
			  setTimeout(Clock,1000);
			 })();
        }); 