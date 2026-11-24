--  Item 6: where a car may stand and the way it drives (1.2.91
--  vehicleNavigation.ts). A car keeps to the right-hand lane, 1.95 m off
--  the street's centre line; it turns right or left at a junction, never
--  straight back unless the road ends, and stops in its own lane by the
--  place it is going to. Written fresh.
with Hood.City;
with Hood.Population.Walk;

package Hood.Population.Roads with Preelaborate is

   Lane_Offset : constant Long_Float := 1.95;
   Kerb_Offset : constant Long_Float := 8.4;  --  PAVEMENT_OFFSET 5.4 + street inset 3

   function On_Road (C : Hood.City.City_State; X, Y : Long_Float) return Boolean;
   --  Inside a driveable lane (2.3 m either side of an open street's line).

   procedure Parking_Spot
     (C : Hood.City.City_State; NX, NY : Long_Float;
      Taken_X, Taken_Y : Walk.Coord_List; Taken : Integer_32;
      X, Y : out Long_Float);
   --  In the lane by the kerb near (NX, NY), 8 m clear of either junction
   --  and 5.5 m clear of the Taken spots.

   procedure Pavement_Beside (C : Hood.City.City_State; X, Y : in out Long_Float);
   --  The footway beside the road at (X, Y).

   type Route_Rec is record
      Start_X, Start_Y : Long_Float;
      Dest_X, Dest_Y   : Long_Float;
      Count : Integer_32;
      Path  : Walk.Point_List;
   end record;

   procedure Vehicle_Route
     (C : Hood.City.City_State; FX, FY, TX, TY : Long_Float; Zig : Boolean;
      Taken_X, Taken_Y : Walk.Coord_List; Taken : Integer_32;
      R : out Route_Rec);
   --  vehicleRoute: a car's way from (FX, FY) to (TX, TY).

end Hood.Population.Roads;
