from fastapi import Request
from fastapi.responses import JSONResponse
import time
import logging

logger = logging.getLogger(__name__)

class ErrorLoggingMiddleware:
    """
    Middleware for logging errors and providing consistent error responses
    """
    async def __call__(self, request: Request, call_next):
        start_time = time.time()
        
        try:
            response = await call_next(request)
            
            # Log slow responses (more than 1 second)
            process_time = time.time() - start_time
            if process_time > 1:
                logger.warning(f"Slow response: {request.method} {request.url.path} took {process_time:.2f}s")
            
            return response
            
        except Exception as e:
            # Log the error with request details
            logger.error(
                f"Error processing request: {request.method} {request.url.path}\n"
                f"Client: {request.client.host if request.client else 'unknown'}\n"
                f"Exception: {str(e)}"
            )
            
            # Return a consistent JSON error response
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Internal server error",
                    "detail": str(e),
                    "path": request.url.path,
                    "timestamp": time.time()
                }
            )