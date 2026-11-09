import type { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { MeshData } from "./types";

export function toVertexData(md: MeshData): VertexData {
  const vd = new VertexData();
  vd.positions = new Float32Array(md.positions);
  vd.normals = new Float32Array(md.normals);
  vd.uvs = new Float32Array(md.uvs);
  vd.indices = md.indices.length > 65535 || md.positions.length / 3 > 65535 ? new Uint32Array(md.indices) : new Uint16Array(md.indices);
  return vd;
}

/** Replace a mesh's geometry in place (keeps identity, material, parent, metadata). */
export function applyMeshData(mesh: Mesh, md: MeshData): void {
  toVertexData(md).applyToMesh(mesh, false);
}

export function createMeshFromData(name: string, md: MeshData, scene: Scene): Mesh {
  const mesh = new Mesh(name, scene);
  applyMeshData(mesh, md);
  return mesh;
}
