from webapp_proxy_host import run_server


if __name__ == "__main__":
    run_server(static_dir_name="landing_page", default_port=8780, app_title="SoftiBridge Landing")

