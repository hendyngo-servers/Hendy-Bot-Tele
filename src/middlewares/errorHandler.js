export function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  
  if (process.env.NODE_ENV !== "test") {
    console.error(`[ErrorHandler] [${req.method} ${req.path}] ${status} - ${message}`);
    if (status === 500 && err.stack) {
      console.error(err.stack);
    }
  }

  res.status(status).json({
    error: message,
    code: err.code || "SERVER_ERROR",
    path: req.originalUrl || req.path,
    timestamp: new Date().toISOString()
  });
}
