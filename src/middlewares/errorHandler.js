export function errorHandler(err, req, res, _next) {
  const status = Number(err.status || err.statusCode || 500);
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  if (process.env.NODE_ENV !== "test") {
    console.error("[ErrorHandler] " + req.method + " " + req.path + " " + safeStatus + " " + (err.code || "SERVER_ERROR") + ": " + (err.message || "Unknown error"));
  }
  const message = safeStatus >= 500 && process.env.NODE_ENV === "production"
    ? "Dịch vụ gặp lỗi. Vui lòng thử lại sau."
    : (err.message || "Internal Server Error");
  res.status(safeStatus).json({
    error: message,
    code: err.code || "SERVER_ERROR",
    path: req.originalUrl || req.path,
    timestamp: new Date().toISOString()
  });
}
