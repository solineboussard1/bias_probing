# Use an official Python image based on Debian
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    python3-dev \
    python3-pip \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip install --upgrade pip

# Set work directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download the NLTK punkt_tab tokenizer model
RUN python3 - <<EOF
import nltk
nltk.download('punkt_tab', quiet=True)
nltk.download('wordnet', quiet=True)
EOF

# Copy the rest of the application code
COPY . .

# Install Node.js dependencies and build the project
RUN npm install && npm run build

# Expose the appropriate port (adjust as needed)
EXPOSE 3000

# Run the application
CMD ["npm", "run", "start"]
