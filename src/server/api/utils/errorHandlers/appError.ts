class AppError extends Error {
  statusCode: number;
  status: string;
  isOperational: boolean;
  code?: number; // <-- add this

  constructor(message: string, statusCode = 500, code?: number) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;
    if (code) this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      message: this.message,
      statusCode: this.statusCode,
      status: this.status,
      code: this.code,
    };
  }
}


export default AppError;