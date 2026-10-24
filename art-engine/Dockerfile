FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      libcairo2 libgl1 libglib2.0-0 wget unzip libvulkan1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download the background-removal model at build time so the first request is fast.
ENV REMBG_MODEL=isnet-general-use
RUN python -c "from rembg import new_session; new_session('isnet-general-use')"

# Optional AI upscaler (Real-ESRGAN, BSD-3). Uncomment to include it.
# RUN wget -q https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-ubuntu.zip \
#  && unzip -q realesrgan-ncnn-vulkan-20220424-ubuntu.zip -d /opt/realesrgan \
#  && chmod +x /opt/realesrgan/realesrgan-ncnn-vulkan \
#  && ln -s /opt/realesrgan/realesrgan-ncnn-vulkan /usr/local/bin/realesrgan-ncnn-vulkan \
#  && rm realesrgan-ncnn-vulkan-20220424-ubuntu.zip

COPY engine.py main.py ./
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
