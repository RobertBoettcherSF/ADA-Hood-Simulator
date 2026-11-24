--  Item 6: the street lattice and its routes (1.2.91 cityLayout.ts
--  streetEdgeOpen :104-120, streetGraph :122-142, streetRouteNodes
--  :144-194). Junction (x, y) of the lattice stands at x * 54, y * 54
--  metres; it is node y * (W + 1) + x. Written fresh.
with Interfaces;
with Hood.City;

package Hood.Streets with Preelaborate is

   use Interfaces;

   Cell : constant := 54.0;  --  constants.ts CELL = BLOCK_SIZE + STREET_WIDTH
   Max_Nodes : constant := 46 * 36;
   Max_Route : constant := 160;  --  junctions on one route (proposed)

   subtype Node_Id is Integer_32 range -1 .. Max_Nodes - 1;
   type Node_List is array (1 .. Max_Route) of Node_Id;
   type Way_Set is array (0 .. 3) of Node_Id;  --  east, south, west, north
   type Way_Count_Set is array (Integer_32 range 0 .. Max_Nodes - 1) of Integer_32;

   procedure Build (C : Hood.City.City_State);
   --  The lattice of the city (once per new game).

   function Width return Integer_32;    --  W + 1
   function Node_Count return Integer_32;
   function Ways (N : Node_Id) return Integer_32;  --  open streets from N
   function Way (N : Node_Id; K : Integer_32) return Node_Id;
   --  K-th open neighbour, in 1.2.91's order: east, south, west, north.
   function Opens (A, B : Node_Id) return Boolean;
   --  B is an open neighbour of A.
   function Node_X (N : Node_Id) return Long_Float;
   function Node_Y (N : Node_Id) return Long_Float;

   function Edge_Open (C : Hood.City.City_State; AX, AY, BX, BY : Integer_32) return Boolean;

   function Block_At (C : Hood.City.City_State; GX, GY : Integer_32) return Integer_32;
   --  cityBlockAt: the block (its merged site) at a grid cell, or No_Id.

   procedure Route
     (FX, FY, TX, TY : Long_Float; Zig : Boolean;
      Nodes : out Node_List; Count : out Integer_32);
   --  streetRouteNodes: the shortest way along the streets from the
   --  junction nearest (FX, FY) to the one nearest (TX, TY), both
   --  included; Zig takes the ways in reverse order. Count is 0 if the
   --  streets do not connect them.

   function Through_Rows (Y : Integer_32) return Boolean;
   function Through_Cols (X : Integer_32) return Boolean;

end Hood.Streets;
