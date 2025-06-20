import logging
import logging.config
from typing import Literal

from scraping_events.env import get_env

_VERBOSE_LOGGERS = [
    "__main__",
    "__mp_main__",
    "scraping_events",
]


def set_logging_config(stream: Literal["stdout", "stderr"] = "stdout"):
    env = get_env()
    config = {
        "version": 1,
        "formatters": {
            "default": {
                "format": "%(asctime)s | %(levelname)-8s | %(name)s - %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
        },
        "handlers": {
            stream: {
                "class": "logging.StreamHandler",
                "stream": f"ext://sys.{stream}",
                "formatter": "default",
                "level": logging.DEBUG,
            },
        },
        "loggers": {
            "uvicorn": {
                "level": logging.INFO,
                "propagate": True,
            },
            **{
                _verbose_logger_name: {
                    "level": logging.DEBUG if env.debug else logging.INFO,
                }
                for _verbose_logger_name in _VERBOSE_LOGGERS
            },
        },
        "root": {
            "level": logging.WARNING,  # inherited by loggers with level not set otherwise
            "handlers": [stream],
        },
        "disable_existing_loggers": False,  # allow loggers to be instantiated before this config
    }
    logging.config.dictConfig(config)
