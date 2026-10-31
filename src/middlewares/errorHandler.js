const errorHandler = (err, req, res, next) => {
  console.error(`[Error] ${err.message}\n`, err.stack);
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Lỗi hệ thống máy chủ.';

  res.status(statusCode).json({
    success: false,
    status: statusCode,
    message: message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

module.exports = errorHandler;
