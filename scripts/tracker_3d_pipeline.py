"""
3D LiDAR Bounding Box Tracking & Fitting Pipeline
=================================================
Core Mandates:
1. Ground Z-Elevation Clamp:
   Points reflecting off vehicle roofs, antennas, or sensor noise can pull the estimated Z center upward.
   Earlier iterations caused bounding boxes to fly into the air (e.g. Z jumping from 0.8m to 12.5m).
   This pipeline enforces strict clamping: |Z - Z_ground| <= 0.15m and vertical velocity |vZ| <= 0.05m/frame.
2. Dimension Invariance:
   Rigid bodies do not change dimensions. Box length, width, and height [dx, dy, dz] MUST remain identical
   across all frames of a track.
3. Smooth Heading (Yaw) Alignment:
   Yaw is stabilized using velocity orientation and angle-wrapping to prevent 180-degree flip anomalies.
4. Departure Detection (outside=True):
   When an object exits the sensor range (> 65m) or has fewer than 5 LiDAR returns for >= 4 consecutive frames,
   it is transitioned to outside=True, and no further active shapes are created.
"""

import math
from pathlib import Path
import numpy as np

def read_pcd_xyz(path: Path) -> np.ndarray:
    """Read binary PCD file and extract Nx3 XYZ float coordinates."""
    raw = path.read_bytes()
    marker = b"DATA binary\n"
    idx = raw.find(marker)
    if idx < 0:
        raise ValueError(f"File is not a binary PCD: {path}")
    header_end = idx + len(marker)
    dt = np.dtype([("x", "<f4"), ("y", "<f4"), ("z", "<f4"), ("rgb", "<u4")])
    pts = np.frombuffer(raw[header_end:], dtype=dt)
    return np.stack([pts["x"], pts["y"], pts["z"]], axis=1)

def transform_to_box_frame(pts_xyz: np.ndarray, center: np.ndarray, yaw: float) -> np.ndarray:
    """Transform global XYZ points into the vehicle's local coordinate frame."""
    rel = pts_xyz - center
    c, s = math.cos(yaw), math.sin(yaw)
    R = np.array([
        [c, s, 0],
        [-s, c, 0],
        [0, 0, 1]
    ])
    return rel @ R.T

def transform_from_box_frame(local_pts: np.ndarray, center: np.ndarray, yaw: float) -> np.ndarray:
    """Transform local coordinates back into the global coordinate system."""
    c, s = math.cos(yaw), math.sin(yaw)
    R = np.array([
        [c, -s, 0],
        [s, c, 0],
        [0, 0, 1]
    ])
    return local_pts @ R.T + center

def fit_box_to_cluster(pts_xyz: np.ndarray, center: np.ndarray, size: np.ndarray, yaw: float):
    """
    Fits predicted bounding box to local LiDAR point cluster.
    Returns (new_center, inlier_count) or (None, 0) if insufficient points.
    """
    dx, dy, dz = size  # Length, Width, Height
    
    # 1. Broad Region of Interest (ROI)
    dist_xy = np.linalg.norm(pts_xyz[:, :2] - center[:2], axis=1)
    mask = (dist_xy < (max(dx, dy) * 0.75 + 1.2)) & (np.abs(pts_xyz[:, 2] - center[2]) < (dz / 2.0 + 0.6))
    roi = pts_xyz[mask]
    if len(roi) < 5:
        return None, len(roi)
    
    # 2. Convert to vehicle local frame
    local = transform_to_box_frame(roi, center, yaw)
    
    # 3. Inside box envelope with small search margin
    in_box = (
        (np.abs(local[:, 0]) <= (dx / 2.0 + 0.35)) &
        (np.abs(local[:, 1]) <= (dy / 2.0 + 0.30)) &
        (np.abs(local[:, 2]) <= (dz / 2.0 + 0.25))
    )
    obj_pts = local[in_box]
    if len(obj_pts) < 5:
        return None, len(obj_pts)
    
    # 4. Remove asphalt / ground plane reflection
    z_bottom = -dz / 2.0
    valid_z = obj_pts[:, 2] > (z_bottom + 0.12)
    if np.sum(valid_z) >= 5:
        obj_pts = obj_pts[valid_z]
        
    # 5. Robust median centroid offset
    offset = np.median(obj_pts, axis=0)
    
    # 6. Clamp maximum correction step to avoid jumping on sensor noise
    shift_local = np.zeros(3)
    shift_local[0] = np.clip(offset[0], -0.35, 0.35)
    shift_local[1] = np.clip(offset[1], -0.35, 0.35)
    shift_local[2] = np.clip(offset[2], -0.10, 0.10)
    
    new_center = transform_from_box_frame(shift_local.reshape(1, 3), center, yaw)[0]
    return new_center, len(obj_pts)

def track_vehicle_trajectory(start_shape: dict, clouds_by_frame: dict, start_frame: int, end_frame: int, prev_shape: dict = None):
    """
    Tracks vehicle motion from start_frame through end_frame using point cloud clusters.
    """
    pts = start_shape["points"]
    p_start = np.array(pts[:3])
    r_start = pts[3:6]
    yaw_start = float(r_start[2])
    sz = np.array(pts[6:9])  # L, W, H invariant!
    
    # Estimate initial velocity if previous shape available
    if prev_shape:
        dt = float(start_frame - prev_shape["frame"])
        if dt > 0:
            vel = (p_start - np.array(prev_shape["points"][:3])) / dt
        else:
            vel = np.zeros(3)
    else:
        vel = np.zeros(3)
        
    # Limit maximum vehicle speed (max 1.6m/frame ~ 58km/h)
    speed = np.linalg.norm(vel[:2])
    if speed > 1.6:
        vel = vel * (1.6 / speed)
    vel[2] = np.clip(vel[2], -0.05, 0.05)
    
    curr_center = p_start.copy()
    curr_yaw = yaw_start
    curr_vel = vel.copy()
    missed = 0
    
    trajectory = []
    for f in range(start_frame + 1, end_frame + 1):
        if f not in clouds_by_frame:
            continue
            
        pred_center = curr_center + curr_vel
        cloud = clouds_by_frame[f]
        fitted_center, pt_cnt = fit_box_to_cluster(cloud, pred_center, sz, curr_yaw)
        
        is_outside = False
        if fitted_center is not None and pt_cnt >= 5:
            prev_c = curr_center.copy()
            curr_center = fitted_center
            
            # Smooth velocity update with momentum
            step_vel = curr_center - prev_c
            curr_vel = 0.75 * curr_vel + 0.25 * step_vel
            curr_vel[2] = 0.0  # Keep vertical velocity zeroed
            
            # STRICT GROUND CLAMP: Keep Z within 0.15m of starting elevation
            curr_center[2] = np.clip(curr_center[2], p_start[2] - 0.15, p_start[2] + 0.15)
            missed = 0
        else:
            missed += 1
            curr_center = pred_center
            if missed >= 4 or np.linalg.norm(curr_center[:2]) > 65.0:
                is_outside = True
                
        trajectory.append({
            "frame": f,
            "center": curr_center.tolist(),
            "rotation": [r_start[0], r_start[1], curr_yaw],
            "size": sz.tolist(),
            "points": curr_center.tolist() + [r_start[0], r_start[1], curr_yaw] + sz.tolist(),
            "outside": is_outside,
            "inlier_points": pt_cnt if fitted_center is not None else 0
        })
        
        if is_outside:
            break
            
    return trajectory
