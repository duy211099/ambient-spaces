defmodule LivingAmbienceWeb.PageControllerTest do
  use LivingAmbienceWeb.ConnCase

  test "GET / renders the scene canvas and controls root", %{conn: conn} do
    html = conn |> get(~p"/") |> html_response(200)

    assert html =~ ~s(data-scene="cafe-rain")
    assert html =~ ~s(id="scene-canvas")
    assert html =~ ~s(id="controls")
    assert html =~ "/assets/app.js"
  end
end
