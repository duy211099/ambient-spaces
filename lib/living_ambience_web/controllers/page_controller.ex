defmodule LivingAmbienceWeb.PageController do
  use LivingAmbienceWeb, :controller

  def home(conn, _params) do
    # The home page is often custom made,
    # so skip the default app layout.
    render(conn, :home, layout: false)
  end

  # Throwaway spike: generative music playground.
  def music(conn, _params) do
    render(conn, :music, layout: false, page_title: "Music lab")
  end
end
