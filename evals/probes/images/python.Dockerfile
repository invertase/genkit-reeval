ARG REEVAL_BASE
FROM ${REEVAL_BASE}

RUN npm i -g genkit-cli@1.44.1

# uv and CPython are pinned; the package index is frozen at the date after the genkit 0.12.0 release.
RUN set -e; u="uv-$(uname -m)-unknown-linux-gnu.tar.gz"; b=https://github.com/astral-sh/uv/releases/download/0.11.2; cd /tmp \
    && curl -fsSLO "$b/$u" && curl -fsSLO "$b/$u.sha256" && sha256sum -c "$u.sha256" \
    && tar -xz --strip-components=1 -C /usr/local/bin -f "$u" && rm -f "$u" "$u.sha256"
ENV UV_PYTHON_INSTALL_DIR=/opt/python \
    UV_CACHE_DIR=/opt/uv-cache \
    PIP_CACHE_DIR=/opt/pip-cache \
    UV_EXCLUDE_NEWER=2026-10-01T00:00:00Z \
    UV_PYTHON_DOWNLOADS=never
RUN UV_PYTHON_DOWNLOADS=automatic uv python install 3.13.12 \
    && ln -s "$(dirname "$(dirname "$(uv python find 3.13.12)")")" /opt/python-current
ENV PATH=/opt/python-current/bin:${PATH}

# The sandbox sets NO_PROXY=...,::1,[::1], which httpx rejects ("Invalid port: ':1]'") on the first Gemini call; every interpreter drops those entries at startup.
RUN mkdir /opt/pyshim && printf 'import os\nfor k in ("NO_PROXY", "no_proxy"):\n    v = os.environ.get(k)\n    if v:\n        os.environ[k] = ",".join(h for h in v.split(",") if ":" not in h)\n' > /opt/pyshim/sitecustomize.py
ENV PYTHONPATH=/opt/pyshim

# Warm the uv and pip caches with the pinned packages; nothing is installed into an attempt's workspace.
RUN uv venv --seed /tmp/warm \
    && uv pip install --python /tmp/warm/bin/python genkit genkit-google-genai genkit-middleware \
    && /tmp/warm/bin/python -m pip install genkit==0.12.0 genkit-google-genai==0.12.0 genkit-middleware==0.12.0 \
    && rm -rf /tmp/warm \
    && chmod -R a+rwX /opt/uv-cache /opt/pip-cache /opt/python
