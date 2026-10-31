import type { Entity } from "../entity";
import { FLOOR_Y } from "./geometry";
import { rrect } from "./common";

const X0 = -700;
const X1 = 2300;

export function createRoom(): Entity {
  return {
    depth: 0.2,
    update() {},
    draw(g) {
      const wall = g.createLinearGradient(0, -400, 0, FLOOR_Y);
      wall.addColorStop(0, "#e6c9a0");
      wall.addColorStop(1, "#d8b184");
      g.fillStyle = wall;
      g.fillRect(X0, -700, X1 - X0, FLOOR_Y + 700);

      g.fillStyle = "#6b4630";
      g.fillRect(X0, -700, X1 - X0, 740);
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.fillRect(X0, 40, X1 - X0, 10);

      g.fillStyle = "#a8714b";
      g.fillRect(X0, 470, 1100 - X0, FLOOR_Y - 470);
      g.fillStyle = "#c08b60";
      g.fillRect(X0, 464, 1100 - X0, 12);
      g.strokeStyle = "rgba(60,30,15,0.25)";
      g.lineWidth = 3;
      for (let x = 60; x < 1100; x += 120) {
        g.strokeRect(x, 492, 96, 112);
      }

      const floor = g.createLinearGradient(0, FLOOR_Y, 0, 1500);
      floor.addColorStop(0, "#946342");
      floor.addColorStop(1, "#6a4129");
      g.fillStyle = floor;
      g.fillRect(X0, FLOOR_Y, X1 - X0, 900);
      g.fillStyle = "#5a3724";
      g.fillRect(X0, FLOOR_Y - 6, X1 - X0, 14);
      g.strokeStyle = "rgba(40,20,10,0.22)";
      g.lineWidth = 2;
      for (let i = 1; i < 7; i++) {
        const y = FLOOR_Y + i * i * 7 + i * 6;
        g.beginPath();
        g.moveTo(X0, y);
        g.lineTo(X1, y);
        g.stroke();
      }

      g.fillStyle = "rgba(120,60,50,0.35)";
      g.beginPath();
      g.ellipse(800, 800, 760, 90, 0, 0, Math.PI * 2);
      g.fill();

      drawDoor(g);
      drawFrame(g, 930, 140);
      drawPlant(g, 925, FLOOR_Y);
    },
  };
}

function drawDoor(g: CanvasRenderingContext2D): void {
  g.fillStyle = "#5e3a28";
  rrect(g, 22, 176, 128, FLOOR_Y - 176 + 4, 6);
  g.fill();
  g.fillStyle = "#7d4e34";
  rrect(g, 32, 188, 108, FLOOR_Y - 196, 4);
  g.fill();
  g.fillStyle = "rgba(255,226,170,0.55)";
  rrect(g, 52, 212, 68, 120, 34);
  g.fill();
  g.fillStyle = "#e3b45a";
  g.beginPath();
  g.arc(124, 440, 6, 0, Math.PI * 2);
  g.fill();
}

function drawFrame(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.fillStyle = "#6b4630";
  rrect(g, x, y, 84, 100, 4);
  g.fill();
  g.fillStyle = "#f0dcb8";
  g.fillRect(x + 8, y + 8, 68, 84);
  g.fillStyle = "#e8a46a";
  g.beginPath();
  g.arc(x + 54, y + 36, 14, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#9bb08a";
  g.beginPath();
  g.moveTo(x + 8, y + 92);
  g.quadraticCurveTo(x + 30, y + 46, x + 52, y + 92);
  g.fill();
  g.fillStyle = "#7c9a7d";
  g.beginPath();
  g.moveTo(x + 34, y + 92);
  g.quadraticCurveTo(x + 58, y + 58, x + 76, y + 92);
  g.fill();
}

function drawPlant(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.fillStyle = "#b5623f";
  g.beginPath();
  g.moveTo(x - 26, y - 56);
  g.lineTo(x + 26, y - 56);
  g.lineTo(x + 18, y);
  g.lineTo(x - 18, y);
  g.closePath();
  g.fill();
  g.fillStyle = "#4f7d4f";
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.38;
    g.beginPath();
    g.ellipse(x + Math.cos(a) * 34, y - 60 + Math.sin(a) * 46, 12, 34, a + Math.PI / 2, 0, Math.PI * 2);
    g.fill();
  }
}
