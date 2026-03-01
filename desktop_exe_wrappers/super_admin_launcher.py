from webapp_proxy_host import run_server


if __name__ == "__main__":
    run_server(static_dir_name="super_admin_webapp", default_port=8783, app_title="SoftiBridge Super Admin")
