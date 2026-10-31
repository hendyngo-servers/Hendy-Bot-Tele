function errorHandler(err,req,res,_next){
  console.error('[Error]',err&&err.message?err.message:'Lỗi không xác định');
  const status=Number(err.statusCode)>=400&&Number(err.statusCode)<600?Number(err.statusCode):500;
  res.status(status).json({success:false,status,message:status===500?'Đã xảy ra lỗi máy chủ. Vui lòng thử lại sau.':err.message,...(process.env.NODE_ENV==='development'?{detail:err.message}:{})});
}
module.exports=errorHandler;
