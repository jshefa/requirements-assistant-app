import os
from locust import HttpUser, task, between
from locust.exception import StopUser
from study_flow import *
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

class StudyUser(HttpUser):
    wait_time = between(1,3)

    def on_start(self):
        self.client.headers.update({
            "X-Access-Code": os.environ["TEST_ACCESS_CODE"]
        })

    @task
    def complete_study(self):
        run_study(self)

        raise StopUser()

