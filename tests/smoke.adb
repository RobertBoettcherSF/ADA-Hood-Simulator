--  Native smoke test (D-027): calls every hs_ export and every Ada unit with
--  contracts on, checks the random numbers against values produced by the
--  TypeScript build 1.2.91 (src/sim/rng.ts run in Node for seed 1932), and
--  prints the values the browser page shows, so the two can be compared.
with Ada.Command_Line;
with Ada.Exceptions;
with Ada.Text_IO;
with Interfaces;
with Hood.Grid;
with Hood.Host_ABI;
with Hood.Random;
with Hood.Trig;
with Hood.Units;
with Hood.Version;
with Hood.World;

procedure Smoke is

   use Ada.Text_IO;
   use Interfaces;
   use Hood.Host_ABI;
   use type Hood.Units.Units;
   use type Hood.Trig.Angle;

   package Hex_IO is new Modular_IO (Unsigned_32);

   Failures : Natural := 0;

   procedure Check (Ok : Boolean; What : String) is
   begin
      if Ok then
         Put_Line ("ok    " & What);
      else
         Put_Line ("FAIL  " & What);
         Failures := Failures + 1;
      end if;
   end Check;

   ---------------------------------------------------------------------
   --  1.2.91 reference values (typed from the Node run of rng.ts)
   ---------------------------------------------------------------------

   type U32_List is array (Positive range <>) of Unsigned_32;
   type I32_List is array (Positive range <>) of Integer_32;

   Ref_Main : constant U32_List :=
     [2087000994, 1345216982, 2537227108, 2322682548, 3464602834,
      1449177721,  955002386, 2725655775, 3304141253, 1945812103,
      3106597394, 3860522775, 3923203638, 3143742962,  942210133,
       573572034, 4118670652, 2227219457, 2140019606, 4173634592];
   Ref_State_After_20 : constant Unsigned_32 := 2271579824;
   Ref_Seed_0_First   : constant Unsigned_32 := 1541420728;
   Ref_Int : constant I32_List :=
     [48, 31, 59, 54, 80, 33, 22, 63, 76, 45,
      72, 89, 91, 73, 21, 13, 95, 51, 49, 97];
   Ref_Plan : constant I32_List :=
     [ 6347, 31496, 30113, 27735, 13669, 28831, 25076, 12886, 27578, 14561,
      15010, 14895, 11210, 18983,  2483, 24216, 15099,  5001,  1002, 15126];
   Ref_Headquarters : constant I32_List := [25332, 10173, 3571, 2067, 29729];
   Ref_Auto_Week_1  : constant U32_List := [3363666125, 3601843148, 2491938879];
   Ref_Chance_35 : constant I32_List :=
     [0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0];
   Ref_Pick_7    : constant I32_List := [3, 2, 4, 3, 5, 2, 1, 4, 5, 3];
   Ref_Shuffle   : constant I32_List := [7, 9, 6, 1, 2, 8, 4, 10, 3, 5];
   Ref_Weighted  : constant I32_List := [2, 2, 2, 2, 3, 2, 0, 2, 2, 2];
   --  0-based item numbers for weights [3, 0, 5, 2]
   Ref_Strategy_Seed  : constant Unsigned_32 := 21878;       --  runs = 2
   Ref_Strategy_First : constant Unsigned_32 := 3469019532;
   Ref_Explore_Seed   : constant Unsigned_32 := 30800;       --  week 1
   Ref_Explore_First  : constant Unsigned_32 := 1739273263;
   Ref_Rival_Seed     : constant Unsigned_32 := 3098;        --  week 1, id 13
   Ref_Rival_First    : constant Unsigned_32 := 277563166;
   Ref_Hash32_1932    : constant Unsigned_32 := 3032841495;

   function Image (V : Unsigned_32) return String is
      S : constant String := Unsigned_32'Image (V);
   begin
      return S (S'First + 1 .. S'Last);
   end Image;

   function Image (V : Integer_32) return String is
      S : constant String := Integer_32'Image (V);
   begin
      return (if V < 0 then S else S (S'First + 1 .. S'Last));
   end Image;

   function File_Name return String is
      Name : String (1 .. Integer (Error_File_Length));
   begin
      for I in Name'Range loop
         Name (I) := Character'Val (Error_File_Char (Integer_32 (I)));
      end loop;
      return Name;
   end File_Name;

   --  Prints Label and the values; counts how many equal the reference.
   procedure Compare_U32 (Label : String; Got, Ref : U32_List) is
      Same : Natural := 0;
   begin
      Put (Label & ":");
      for I in Got'Range loop
         Put (" " & Image (Got (I)));
         if Got (I) = Ref (I) then
            Same := Same + 1;
         end if;
      end loop;
      New_Line;
      Check (Same = Ref'Length, Label & Natural'Image (Same) & "/" & Image (Integer_32 (Ref'Length))
             & " match 1.2.91");
   end Compare_U32;

   procedure Compare_I32 (Label : String; Got, Ref : I32_List) is
      Same : Natural := 0;
   begin
      Put (Label & ":");
      for I in Got'Range loop
         Put (" " & Image (Got (I)));
         if Got (I) = Ref (I) then
            Same := Same + 1;
         end if;
      end loop;
      New_Line;
      Check (Same = Ref'Length, Label & Natural'Image (Same) & "/" & Image (Integer_32 (Ref'Length))
             & " match 1.2.91");
   end Compare_I32;

   procedure Random_Checks is
      use Hood.Random;
      G : Mulberry;
      P : Plan_Lcg;
      U : Unsigned_32;
      V : Integer_32;
      B : Boolean;
      W : Positive;
      Main_Got  : U32_List (1 .. 20);
      Int_Got   : I32_List (1 .. 20);
      Plan_Got  : I32_List (1 .. 20);
      HQ_Got    : I32_List (1 .. 5);
      Auto_Got  : U32_List (1 .. 3);
      Ch_Got    : I32_List (1 .. 20);
      Pick_Got  : I32_List (1 .. 10);
      Wt_Got    : I32_List (1 .. 10);
      Deck      : Index_List := [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      Weights   : constant Weight_List := [3, 0, 5, 2];
   begin
      --  Through the exports (what the page shows) ...
      for I in 1 .. 20 loop
         Main_Got (I) := Rng_Value (Stream_Main, Integer_32 (I));
         Int_Got (I)  := Integer_32 (Rng_Value (Stream_Int, Integer_32 (I)));
         Plan_Got (I) := Integer_32 (Rng_Value (Stream_Plan, Integer_32 (I)));
      end loop;
      Compare_U32 ("mulberry32 seed 1932", Main_Got, Ref_Main);
      Compare_I32 ("int (0, 99) seed 1932", Int_Got, Ref_Int);
      Compare_I32 ("city-plan LCG seed 1932", Plan_Got, Ref_Plan);
      Check (Rng_Value (4, 1) = 0 and then Rng_Value (Stream_Main, 0) = 0,
             "hs_rng_value is 0 for an unknown stream or index");

      --  ... and directly.
      G := Seeded (1932);
      for I in 1 .. 20 loop
         Next (G, U);
      end loop;
      Check (State (G) = Ref_State_After_20,
             "mulberry32 state after 20 draws = " & Image (State (G)));
      G := Seeded (0);
      Next (G, U);
      Check (U = Ref_Seed_0_First, "seed 0 first value = " & Image (U));

      G := Seeded (1932);
      Int (G, 5, 5, V);
      Check (V = 5, "int (5, 5) = 5");
      Int (G, 7, 3, V);
      Check (V = 7, "int (7, 3) = 7 without a draw");
      Next (G, U);
      Check (U = Ref_Main (2), "the next value is the 2nd of the stream");

      P := Plan_Seeded (Headquarters_Seed (1932));
      for I in HQ_Got'Range loop
         Plan_Next (P, HQ_Got (I));
      end loop;
      Compare_I32 ("headquarters LCG", HQ_Got, Ref_Headquarters);

      G := Seeded (Auto_Week_Seed (1932, 1));
      for I in Auto_Got'Range loop
         Next (G, Auto_Got (I));
      end loop;
      Compare_U32 ("Auto week 1 stream", Auto_Got, Ref_Auto_Week_1);

      G := Seeded (1932);
      for I in Ch_Got'Range loop
         Chance (G, 35, 100, B);
         Ch_Got (I) := (if B then 1 else 0);
      end loop;
      Compare_I32 ("chance (35/100)", Ch_Got, Ref_Chance_35);

      G := Seeded (1932);
      for I in Pick_Got'Range loop
         Pick_Index (G, 7, Pick_Got (I));
      end loop;
      Compare_I32 ("pick of 7", Pick_Got, Ref_Pick_7);

      G := Seeded (1932);
      Shuffle (G, Deck);
      Compare_I32 ("shuffle 1 .. 10", I32_List (Deck), Ref_Shuffle);

      G := Seeded (1932);
      for I in Wt_Got'Range loop
         Weighted (G, Weights, W);
         Wt_Got (I) := Integer_32 (W - Weights'First);
      end loop;
      Compare_I32 ("weighted [3, 0, 5, 2]", Wt_Got, Ref_Weighted);

      G := Seeded (1932);
      Weighted (G, [0, -1], W);
      Check (W = 1 and then State (G) = 1932, "weighted with no positive weight: first, no draw");

      Check (Strategy_Seed (1932, 2) = Ref_Strategy_Seed, "strategy seed");
      G := Seeded (Strategy_Seed (1932, 2));
      Next (G, U);
      Check (U = Ref_Strategy_First, "strategy stream first value");
      Check (Explore_Seed (1932, 1) = Ref_Explore_Seed, "explore seed");
      G := Seeded (Explore_Seed (1932, 1));
      Next (G, U);
      Check (U = Ref_Explore_First, "explore stream first value");
      Check (Rival_Week_Seed (1932, 1, 13) = Ref_Rival_Seed, "rival week seed");
      G := Seeded (Rival_Week_Seed (1932, 1, 13));
      Next (G, U);
      Check (U = Ref_Rival_First, "rival stream first value");
      Check (City_Plan_Seed (1932, 1) = 1933, "city-plan retry seed");
      Check (Hash32 (1932) = Ref_Hash32_1932 and then Hash32 (0) = 0, "hash32");
   end Random_Checks;

   procedure Number_Checks is
      use Hood.Units;
      Expected : constant I32_List := [13824, 2764, 1280, 362, 46341, 65536, 128, 5, 38500];
      Swept    : Natural := 0;
      N        : Unsigned_64 := 0;
   begin
      Put ("hs_check_value 1 .." & Natural'Image (Check_Count) & ":");
      for Id in 1 .. Check_Count loop
         Put (" " & Image (Check_Value (Integer_32 (Id))));
      end loop;
      New_Line;
      for Id in 1 .. Check_Count loop
         Check (Check_Value (Integer_32 (Id)) = Expected (Id),
                "check" & Natural'Image (Id) & " = " & Image (Expected (Id)));
      end loop;
      Check (Check_Value (0) = 0 and then Check_Value (Check_Count + 1) = 0, "unknown check ids give 0");

      --  Isqrt: the contract runs on every call (-gnata).
      while N < 2**62 loop
         Swept := Swept + Natural (Isqrt (N) mod 2);
         N := N * 3 + 1;
      end loop;
      for K in Unsigned_64'(0) .. 100_000 loop
         Swept := Swept + Natural (Isqrt (K) mod 2);
      end loop;
      Check (Isqrt (2**62) = 2**31 and then Isqrt (99) = 9 and then Isqrt (100) = 10,
             "isqrt contract on a sweep of values");
      Check (Swept > 0, "isqrt sweep ran");
      Check (Floor_Div (-7, 2) = -4 and then Floor_Div (7, 2) = 3 and then Floor_Div (-6, 2) = -3,
             "floor division");
      Check (Ratio (-54, 5) = -2765, "negative ratio rounds down");
      Check (Distance (Whole (-3), Whole (4)) = Whole (5), "distance (-3, 4) = 5");
   end Number_Checks;

   procedure Trig_Checks is
      use Hood.Trig;
      Worst_Sum  : Integer_64 := 0;
      Worst_Back : Integer_32 := 0;
      S, C       : Integer_64;
      Back       : Angle;
      Diff       : Integer_32;
   begin
      for A in Angle loop
         S := Integer_64 (Sin (A));
         C := Integer_64 (Cos (A));
         Worst_Sum := Integer_64'Max (Worst_Sum, abs (S * S + C * C - One * One));
         Back := Atan2 (Hood.Units.Units (S), Hood.Units.Units (C));
         Diff := Integer_32 (Back - A);
         Diff := Integer_32'Min (Diff, Steps - Diff);
         Worst_Back := Integer_32'Max (Worst_Back, Diff);
      end loop;
      Put_Line ("trig: worst |sin^2 + cos^2 - 1| =" & Integer_64'Image (Worst_Sum)
                & " / 2^32, worst atan2 round trip =" & Integer_32'Image (Worst_Back) & " step");
      --  Each table value is off by at most 1/2, so s^2 + c^2 is off by at
      --  most |s| + |c| + 1/2 <= sqrt 2 * 65536 + 1/2 < 92_683.
      Check (Worst_Sum < 92_683, "sin^2 + cos^2 within rounding for all 1024 angles");
      Check (Worst_Back <= 1, "atan2 inverts sin/cos within one step for all 1024 angles");
      Check (Sin (0) = 0 and then Sin (Quarter_Turn) = One and then Sin (Half_Turn) = 0
             and then Sin (Half_Turn + Quarter_Turn) = -One, "sine at the quarter turns");
      Check (Atan2 (0, 0) = 0 and then Atan2 (1, 0) = Quarter_Turn
             and then Atan2 (0, -1) = Half_Turn and then Atan2 (-1, 0) = Half_Turn + Quarter_Turn,
             "atan2 on the axes");
   end Trig_Checks;

   procedure Grid_Checks is
      use Hood.Grid;
      Center    : Integer_64;
      In_Block  : Boolean;
      Pitch_Ok  : Boolean := True;
      Cells_Ok  : Boolean := True;
      Kind      : Integer_32;
   begin
      --  Of each block's five cells, a cell is block when its centre lies
      --  between the street edges (7 and 47 units from the block line).
      for I in 0 .. 4 loop
         Center := Integer_64 (2 * I + 1) * Pitch / 10;
         In_Block := Center >= Street_Half and then Center < Street_Half + Block_Size;
         Pitch_Ok := Pitch_Ok and then (Kind_In_Pitch (Integer_32 (I)) = Block) = In_Block;
      end loop;
      Check (Pitch_Ok, "cell kinds follow the street edges (cells 1-3 block, 0 and 4 street)");
      Check (Grid_W = 220 and then Grid_H = 175, "grid 220 x 175 for the Large city");
      for X in 0 .. Grid_W - 1 loop
         for Y in 0 .. Grid_H - 1 loop
            Kind := Hood.Host_ABI.Cell_Kind (X, Y);
            Cells_Ok := Cells_Ok and then Kind =
              (if Kind_In_Pitch (X) = Block and then Kind_In_Pitch (Y) = Block then 1 else 0);
         end loop;
      end loop;
      Check (Cells_Ok, "every one of the 38,500 cells has the right kind");
      Check (Hood.Host_ABI.Cell_Kind (-1, 0) = -1 and then Hood.Host_ABI.Cell_Kind (0, 175) = -1, "outside the grid gives -1");
      Check (Cell_Of (Hood.Units.Whole (54) - 1) = 4 and then Cell_Of (Hood.Units.Ratio (54, 5)) = 0
             and then Cell_Of (Hood.Units.Whole (-1)) = -1, "cell of a position");
   end Grid_Checks;

   procedure World_Checks is
      Small : Hood.World.World_State;
      First : Unsigned_32;
   begin
      Check (State_Hash = 0 and then Grid_W = 0 and then Cell_Kind (0, 0) = -1,
             "before hs_new_game: hash 0, empty grid");
      New_Game (1932, 1932, 44, 35);
      First := State_Hash;
      Put ("world hash seed 1932/1932 Large:  " & Image (First) & "  ");
      Hex_IO.Put (First, Base => 16);
      New_Line;
      New_Game (1932, 1932, 44, 35);
      Check (State_Hash = First, "the same world gives the same hash");
      New_Game (1933, 1932, 44, 35);
      Check (State_Hash /= First, "another seed gives another hash");
      New_Game (1932, 1932, 99, 1);
      Check (Grid_W = 220 and then Grid_H = 40, "sizes are clamped to 8 .. 44 by 8 .. 35");
      Hood.World.New_Game (Small, 1932, 1932, 8, 8);
      Check (Hood.World.Hash (Small) /= First, "a small world hashes differently");
      New_Game (16#80AB_CD71#, 1932, 44, 35);
      Check (Rng_Value (Stream_Main, 1) /= 0, "a seed above 2**31 is accepted");
      New_Game (1932, 1932, 44, 35);
   end World_Checks;

begin
   Put_Line ("stamp          " & Hood.Version.Stamp);
   Put_Line ("hs_build_id    " & Image (Build_Id));
   Check (Build_Id = Hood.Version.Build_Id, "hs_build_id matches the stamp");
   World_Checks;
   Random_Checks;
   Number_Checks;
   Trig_Checks;
   Grid_Checks;
   Check (Error_File_Length = 0, "hs_error_file_length is 0 before a stop");
   Check (Error_File_Char (1) = 0, "hs_error_file_char is 0 outside the name");
   begin
      Crash_Test (Error_Crash_Test);
   exception
      when E : Program_Error =>
         Put_Line ("hs_crash_test (4) stopped at "
                   & Ada.Exceptions.Exception_Message (E));
   end;
   Check (Pending_Code = Error_Crash_Test, "hs_crash_test sets code 4");
   Set_Error_File ("hood-host_abi.adb");
   Check (File_Name = "hood-host_abi.adb",
          "hs_error_file_length/hs_error_file_char return the file name");

   if Failures = 0 then
      Put_Line ("smoke passed");
   else
      Put_Line ("smoke FAILED:" & Natural'Image (Failures));
      Ada.Command_Line.Set_Exit_Status (Ada.Command_Line.Failure);
   end if;
end Smoke;
