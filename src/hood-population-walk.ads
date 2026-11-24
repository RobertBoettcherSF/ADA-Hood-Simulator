--  Item 6: walking along the pavements (1.2.91 movement.ts walkRoute
--  :150-155, trimDoubling :171-176, footwayRoute :178-276, stepRoute
--  :365-460; transport.ts transportSpeed :47-53). Routes run corner to
--  corner round the blocks and cross the streets only at the corners,
--  each crossing marked with its length so the walker can look for
--  traffic before stepping off. Written fresh.
with Hood.City;

package Hood.Population.Walk with Preelaborate is

   --  Caps (proposed). 1.2.91 seed 1932: a walk of up to 203 points
   --  across the city; at most 12,418 sixteen-point chunks in use at once
   --  (Large, week 1).
   Max_Path_Points : constant := 256;
   Chunk_Points    : constant := 16;
   Max_Chunks      : constant := 40_960;

   type Point is record
      X, Y  : Long_Float;
      Cross : Long_Float;  --  the crossing's length, 0.0 when none
   end record;

   type Point_List is array (Integer_32 range 0 .. Max_Path_Points - 1) of Point;

   Max_Spots : constant := Max_Vehicles;
   type Coord_List is array (Integer_32 range 0 .. Max_Spots - 1) of Long_Float;
   --  item 6: where the gang cars stand (parkedSpots)

   procedure Reset;
   --  Empties the pool (a new game).

   function Pool_Full return Boolean;
   --  A route did not fit (the cap was reached); reported, never clamped.

   function Points_Ahead (S : Population_State; I : Integer_32) return Integer_32 is
     (S.People (I).Path_Len);
   function Point_Of (S : Population_State; I : Integer_32; K : Integer_32) return Point
     with Pre => K in 0 .. S.People (I).Path_Len - 1;
   procedure Drop_Front (S : in out Population_State; I : Integer_32; N : Integer_32);
   procedure Free_Route (S : in out Population_State; I : Integer_32);
   procedure Store_Route
     (S : in out Population_State; I : Integer_32; List : Point_List; N : Integer_32);

   procedure Walk_Route
     (C : Hood.City.City_State; FX, FY, TX, TY : Long_Float; Id : Integer_32;
      List : out Point_List; N : out Integer_32);
   --  walkRoute from (FX, FY) to (TX, TY) for the person numbered Id.

   function Walk_Length
     (C : Hood.City.City_State; FX, FY, TX, TY : Long_Float; Id : Integer_32) return Long_Float;
   --  transport.ts walkLength: the length of that walk.

   function Route_Length (S : Population_State; I : Integer_32) return Long_Float;
   --  transport.ts routeLength: the walk still ahead of him.

   procedure Set_Destination
     (S : in out Population_State; C : Hood.City.City_State; I : Integer_32; TX, TY : Long_Float);
   --  setDestination on foot.
   procedure Clear_Destination (S : in out Population_State; I : Integer_32);

   function Walk_Speed return Long_Float;
   function Speed (S : Population_State; I : Integer_32) return Long_Float;
   --  transportSpeed on foot: 0.54 m a minute; one civilian errand in 64
   --  hurried (x 1.5).

   function Step
     (S : in out Population_State; C : Hood.City.City_State; I : Integer_32;
      Traffic : Boolean) return Boolean;
   --  stepRoute for one minute on foot: True on arrival (or with nowhere
   --  to go). With Traffic, he waits at a kerb for a gap.

   procedure Door
     (S : Population_State; C : Hood.City.City_State; B : Integer_32; X, Y : out Long_Float);
   --  world.ts buildingDoor: on the pavement 1.6 m outside the side the
   --  door is drawn on; a hidden office is entered through its front.

   function R01 (Id, Salt : Integer_32) return Long_Float;
   --  hash.ts r01: 0 .. 1 from a number and a salt.
   function H2 (Id, Salt : Integer_32) return Unsigned_32;

end Hood.Population.Walk;
