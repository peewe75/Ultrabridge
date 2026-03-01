from webapp_proxy_host import run_server


if __name__ == "__main__":
    run_server(static_dir_name="admin_lite_webapp", default_port=8784, app_title="SoftiBridge Admin Lite")
