defmodule LivingAmbienceWeb.PageControllerTest do
  use LivingAmbienceWeb.ConnCase

  test "GET / renders the scene canvas and controls root", %{conn: conn} do
    html = conn |> get(~p"/") |> html_response(200)

    assert html =~ ~s(data-scene="cafe-rain")
    assert html =~ ~s(id="scene-canvas")
    assert html =~ ~s(id="controls")
    assert html =~ "/assets/app.js"
  end

  test "GET /music renders the studio shell", %{conn: conn} do
    html = conn |> get(~p"/music") |> html_response(200)

    assert html =~ ~s(id="music-studio")
    assert html =~ ~s(id="studio-visual")
    assert html =~ ~s(id="guide-panel")
    assert html =~ "/assets/app.js"
  end
end
