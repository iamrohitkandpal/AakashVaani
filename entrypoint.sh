#!/bin/sh
set -e

# Start the backend server in the background
cd /backend
echo "Starting backend server..."
python3 server.py &
BACKEND_PID=$!

# Start Nginx in the background
echo "Starting nginx..."
nginx &
NGINX_PID=$!

# Handle termination signals
trap 'echo "Shutting down..."; kill $BACKEND_PID $NGINX_PID; exit 0' SIGTERM SIGINT

# Monitor both processes
while kill -0 $BACKEND_PID 2>/dev/null && kill -0 $NGINX_PID 2>/dev/null; do
    sleep 1
done

# If we get here, one of the processes died
if kill -0 $BACKEND_PID 2>/dev/null; then
    echo "Nginx died, shutting down backend..."
    kill $BACKEND_PID
else
    echo "Backend died, shutting down nginx..."
    kill $NGINX_PID
fi

exit 1