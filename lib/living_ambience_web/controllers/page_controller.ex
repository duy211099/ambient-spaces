defmodule LivingAmbienceWeb.PageController do
  use LivingAmbienceWeb, :controller

  def home(conn, _params) do
    # The home page is often custom made,
    # so skip the default app layout.
    render(conn, :home, layout: false)
  end

  def music(conn, _params) do
    render(conn, :music, layout: false, page_title: "Music studio")
  end
end
