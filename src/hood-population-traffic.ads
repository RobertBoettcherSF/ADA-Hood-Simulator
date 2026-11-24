--  Item 6: the city's own traffic (1.2.91 traffic.ts). Cars and lorries
--  keep a timetable round the streets: where one is follows from its
--  number and the minute alone, less the minutes it has stood. Each
--  minute a car stops for walkers on a crossing in front of it, for a
--  gang car in its lane, at a junction another car is in or about to
--  enter, and behind a stopped car. Walkers wait at the kerb while a car
--  comes. Written fresh.
with Hood.City;

package Hood.Population.Traffic with Preelaborate is

   Max_Cars : constant := 320;  --  traffic.ts MAX_CARS

   procedure Build (C : Hood.City.City_State);
   --  The timetable of a new game (after Hood.Streets.Build).

   procedure Open_Week (S : Population_State; C : Hood.City.City_State);
   --  The context for minute 0 of a week: the cars where they stand and
   --  whoever is on a crossing or at the wheel now (trafficContext with
   --  no scan this minute).

   procedure Begin_Scan;
   --  Ambient slices start: collect this minute's crossings and drivers.
   procedure Scan_Person (S : Population_State; I : Integer_32);
   --  streetScanCollector add: after a person's step in his slice.

   procedure Tick (S : Population_State; C : Hood.City.City_State);
   --  tickTraffic at S.Minute, after the slices.

   function Crossing_Has_Traffic
     (S : Population_State; AX, AY, NX, NY : Long_Float) return Boolean;
   --  movement.ts crossingHasTraffic, from the minute's context.

   function Road_Ahead_Blocked (AX, AY, NX, NY : Long_Float) return Boolean;
   function Road_Ahead_Room
     (S : Population_State; Self : Integer_32;
      AX, AY, NX, NY : Long_Float; Has_After : Boolean; FX, FY : Long_Float)
      return Long_Float;
   --  roadAheadRoom for a gang car: Self is its driver (a person index).

   --  The page.
   function Car_Count return Integer_32;
   function Car_X (K : Integer_32) return Long_Float;
   function Car_Y (K : Integer_32) return Long_Float;
   function Car_Head (K : Integer_32) return Integer_32;   --  0 east .. 3 north
   function Car_Truck (K : Integer_32) return Boolean;
   function Car_Colour (K : Integer_32) return Integer_32;
   function Car_Halted (K : Integer_32) return Boolean;

   function Traffic_Hash return Unsigned_32;
   --  FNV-1a over each car's delay and halted flag (the check's carHash).
   function Crossings_In_Use return Integer_32;
   --  Walkers on a crossing in the context's scan.
   function Halted_Count return Integer_32;

end Hood.Population.Traffic;
